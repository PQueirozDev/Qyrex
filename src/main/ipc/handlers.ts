import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import fs from "node:fs";
import { z } from "zod";
import type { IpcResult } from "../../shared/types.js";
import * as projectService from "../services/projectService.js";
import * as taskService from "../services/taskService.js";
import * as fileService from "../services/fileService.js";
import * as systemService from "../services/systemService.js";
import * as aiService from "../services/aiService.js";
import * as clientService from "../services/clientService.js";
import * as marketingService from "../services/marketingService.js";
import * as calendarService from "../services/calendarService.js";
import * as gitService from "../services/gitService.js";
import * as searchService from "../services/searchService.js";
import * as recentService from "../services/recentService.js";
import * as commandService from "../services/commandService.js";
import * as terminalService from "../services/terminalService.js";
import { listIntegrationStatus } from "../services/integrationsService.js";
import * as github from "../integrations/github.js";
import * as notion from "../integrations/notion.js";
import * as localMedia from "../integrations/media/localMedia.js";
import { getSubscriptionLimits } from "../integrations/cli/limits.js";
import * as spotify from "../integrations/spotify.js";
import * as googleCalendar from "../integrations/googleCalendar.js";
import { getSettings, updateSettings } from "../database/db.js";
import { assertAuthorizableDir, assertPathAllowed } from "../security/paths.js";
import * as v from "../security/validation.js";
import { createLogger, getLogDir } from "../logger.js";
import { translate } from "../../shared/i18n.js";
import * as updateService from "../services/updateService.js";
import * as usageService from "../services/usageService.js";
import { getDiscordStatus, setDiscordActivity } from "../integrations/discord.js";

const log = createLogger("ipc");

/**
 * Todo handler:
 * 1. Confere que a chamada veio da UI do próprio app (não de um frame externo).
 * 2. Valida o input com zod (security/validation.ts) — o renderer é não confiável.
 * 3. Ações sensíveis exigem `confirmed: true`, que a UI só envia depois do
 *    diálogo de confirmação; os services ainda revalidam paths na allowlist.
 * 4. Retorna sempre IpcResult<T>: nenhuma exceção vaza como stack trace bruto.
 */

let devServerUrl: string | null = null;
let settingsChangedHook: (() => void) | null = null;

/** Chamado depois de salvar configurações (atualiza bandeja, Discord...). */
export function setSettingsChangedHook(hook: () => void): void {
  settingsChangedHook = hook;
}

export function setDevServerUrl(url: string | null): void {
  devServerUrl = url;
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? "";
  const trusted = url.startsWith("file://") || (devServerUrl !== null && url.startsWith(devServerUrl));
  if (!trusted) throw new Error("Origem da chamada IPC não autorizada.");
}

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<unknown>> => {
    try {
      assertTrustedSender(event);
      const data = await fn(event, ...args);
      return { ok: true, data: data === undefined ? null : data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`${channel} falhou: ${message}`);
      let language: "pt" | "en" = "pt";
      try {
        language = getSettings().language;
      } catch {
        // banco indisponível: mantém português
      }
      return { ok: false, error: translate(language, message) };
    }
  });
}

function requireConfirmation(confirmed: unknown): void {
  if (confirmed !== true) throw new Error("Ação sensível não confirmada pelo usuário.");
}

const windowOf = (e: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender);

export function registerIpcHandlers(): void {
  // --- Settings ---------------------------------------------------------------------
  handle("settings:get", () => getSettings());
  handle("settings:update", (_e, patch) => {
    const parsed = v.parse(v.settingsPatch, patch);
    const updated = updateSettings(parsed);
    if (parsed.startWithSystem !== undefined) systemService.applyStartWithSystem(parsed.startWithSystem);
    settingsChangedHook?.();
    return updated;
  });
  handle("settings:addAllowedDir", async (e, dir) => {
    let target = dir === undefined || dir === null ? null : v.parse(v.filePath, dir);
    if (!target) target = await systemService.pickDirectory(windowOf(e), "Autorizar pasta no QrzSpace");
    if (!target) return getSettings();
    const resolved = assertAuthorizableDir(target);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) throw new Error("A pasta não existe.");
    const current = getSettings().allowedProjectDirs;
    if (current.some((d) => d.toLowerCase() === resolved.toLowerCase())) return getSettings();
    return updateSettings({ allowedProjectDirs: [...current, resolved] });
  });
  handle("settings:removeAllowedDir", (_e, dir) => {
    const target = v.parse(v.filePath, dir);
    return updateSettings({ allowedProjectDirs: getSettings().allowedProjectDirs.filter((d) => d !== target) });
  });

  // --- Atualizações --------------------------------------------------------------
  handle("update:status", () => updateService.getUpdateStatus());
  handle("update:check", (_e, download) => updateService.checkForUpdates(download === true));
  handle("update:download", () => updateService.downloadUpdate());
  handle("update:install", () => updateService.installUpdate());

  // --- Discord Rich Presence ---------------------------------------------------------
  handle("discord:status", () => getDiscordStatus());
  handle("discord:setActivity", (_e, page, project) =>
    setDiscordActivity(
      v.parse(z.string().max(40), page),
      project === undefined || project === null ? null : v.parse(z.string().max(200), project)
    )
  );

  // --- Sistema ---------------------------------------------------------------------
  handle("system:info", () => ({
    platform: process.platform,
    appVersion: app.getVersion(),
    vscodePath: systemService.detectVSCode(),
    logsDir: getLogDir(),
    terminalAvailable: terminalService.isTerminalAvailable(),
  }));
  handle("system:memory", () => {
    // Memória real (working set) de todos os processos do app, em MB.
    const kb = app.getAppMetrics().reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0);
    return Math.round(kb / 1024);
  });
  handle("system:setTitleBarColors", (e, colors) => {
    const c = v.parse(z.object({ color: z.string().regex(/^#[0-9a-f]{6}$/i), symbolColor: z.string().regex(/^#[0-9a-f]{6}$/i) }), colors);
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && process.platform === "win32") win.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: 48 });
  });
  handle("system:openVSCode", (_e, p) => systemService.openInVSCode(v.parse(v.filePath, p)));
  handle("system:openExplorer", (_e, p) => systemService.openInExplorer(v.parse(v.filePath, p)));
  handle("system:openFile", (_e, p) => {
    const target = v.parse(v.filePath, p);
    return systemService.openFile(target).then(() => recentService.recordActivity("file", target, target.split(/[\\/]/).pop() ?? target));
  });
  handle("system:openTerminal", (_e, p, shellName) =>
    systemService.openTerminal(v.parse(v.filePath, p), shellName === undefined ? undefined : v.parse(z.enum(["powershell", "cmd"]), shellName))
  );
  handle("system:openExternalUrl", (_e, url) => systemService.openExternalUrl(v.parse(z.string().max(4096), url)));
  handle("system:pickDirectory", (e, title) =>
    systemService.pickDirectory(windowOf(e), title === undefined ? undefined : v.parse(z.string().max(120), title))
  );
  handle("system:pickVSCode", async (e) => {
    const picked = await systemService.pickExecutable(windowOf(e));
    return picked ? systemService.setVSCodePath(picked) : null;
  });
  handle("system:detectVSCode", () => systemService.detectVSCode());
  handle("system:openLogs", async () => {
    const dir = getLogDir();
    if (!dir) throw new Error("Pasta de logs indisponível.");
    const error = await shell.openPath(dir);
    if (error) throw new Error(error);
  });
  handle("system:openWhatsApp", (_e, target) => systemService.openWhatsApp(v.parse(z.enum(["desktop", "web"]), target)));
  handle("system:whatsappStatus", () => ({ desktopInstalled: systemService.isWhatsAppDesktopInstalled() }));
  handle("system:openWhatsAppChat", (_e, input, preferDesktop) => {
    const { phone, message } = v.parse(v.whatsappLink, input);
    return systemService.openWhatsAppChat(phone, message, preferDesktop === true);
  });
  handle("system:whatsappUrl", (_e, input) => {
    const { phone, message } = v.parse(v.whatsappLink, input);
    return systemService.buildWhatsAppUrl(phone, message);
  });
  handle("system:openSpotifyApp", () => systemService.openSpotifyApp());

  // --- Projetos ----------------------------------------------------------------------
  handle("projects:list", () => projectService.listProjectsWithGit());
  handle("projects:detect", (_e, p) => projectService.detectProject(v.parse(v.filePath, p)));
  handle("projects:create", (_e, input) => projectService.createProject(v.parse(v.projectCreate, input)));
  handle("projects:update", (_e, id, patch) => projectService.updateProject(v.parse(v.id, id), v.parse(v.projectUpdate, patch)));
  handle("projects:toggleFavorite", (_e, id) => projectService.toggleFavorite(v.parse(v.id, id)));
  handle("projects:touchOpened", (_e, id) => projectService.touchLastOpened(v.parse(v.id, id)));
  handle("projects:delete", (_e, id) => projectService.deleteProject(v.parse(v.id, id)));

  // --- Git / GitHub --------------------------------------------------------------------
  handle("git:status", (_e, p) => gitService.getGitStatus(v.parse(v.filePath, p)));
  handle("git:commits", (_e, p, limit) =>
    gitService.getRecentCommits(v.parse(v.filePath, p), limit === undefined ? 10 : v.parse(z.number().int().min(1).max(50), limit))
  );
  handle("git:changes", (_e, p) => gitService.getChangedFiles(v.parse(v.filePath, p)));
  handle("git:commit", (_e, input) => {
    const parsed = v.parse(v.gitCommit, input);
    requireConfirmation(parsed.confirmed);
    return gitService.commit(parsed.projectPath, parsed.message, parsed.stageAll);
  });
  handle("git:pull", (_e, input) => {
    const parsed = v.parse(v.gitRemoteOp, input);
    requireConfirmation(parsed.confirmed);
    return gitService.pull(parsed.projectPath);
  });
  handle("git:push", (_e, input) => {
    const parsed = v.parse(v.gitRemoteOp, input);
    requireConfirmation(parsed.confirmed);
    return gitService.push(parsed.projectPath);
  });
  handle("github:overview", (_e, url) => github.overview(v.parse(z.string().max(500), url)));

  // --- Tarefas ------------------------------------------------------------------------
  handle("tasks:list", (_e, filter) =>
    taskService.listTasks(
      filter === undefined || filter === null
        ? undefined
        : v.parse(z.object({ status: v.taskStatus.optional(), projectId: v.id.optional(), clientId: v.id.optional() }), filter)
    )
  );
  handle("tasks:create", (_e, input) => taskService.createTask(v.parse(v.taskCreate, input)));
  handle("tasks:update", (_e, id, patch) => taskService.updateTask(v.parse(v.id, id), v.parse(v.taskUpdate, patch)));
  handle("tasks:delete", (_e, id) => taskService.deleteTask(v.parse(v.id, id)));

  // --- Arquivos -----------------------------------------------------------------------
  handle("files:list", (_e, p) => fileService.listDir(v.parse(v.filePath, p)));
  handle("files:createFolder", (_e, dir, name) => fileService.createFolder(v.parse(v.filePath, dir), v.parse(z.string().max(255), name)));
  handle("files:rename", (_e, p, name) => fileService.renameEntry(v.parse(v.filePath, p), v.parse(z.string().max(255), name)));
  handle("files:copy", (_e, source, dest) => fileService.copyEntry(v.parse(v.filePath, source), v.parse(v.filePath, dest)));
  handle("files:move", (_e, source, dest, confirmed) => {
    requireConfirmation(confirmed);
    return fileService.moveEntry(v.parse(v.filePath, source), v.parse(v.filePath, dest));
  });
  handle("files:delete", (_e, p, confirmed) => {
    requireConfirmation(confirmed);
    return fileService.deleteEntry(v.parse(v.filePath, p));
  });
  handle("files:preview", (_e, p) => fileService.previewFile(v.parse(v.filePath, p)));
  handle("files:search", (_e, query, root) =>
    fileService.searchFiles(v.parse(z.string().max(200), query), root === undefined || root === null ? undefined : v.parse(v.filePath, root))
  );
  handle("files:isAllowed", (_e, p) => {
    try {
      assertPathAllowed(v.parse(v.filePath, p));
      return true;
    } catch {
      return false;
    }
  });

  // --- Busca / atividade ----------------------------------------------------------------
  handle("search:global", (_e, query) => searchService.globalSearch(v.parse(z.string().max(200), query)));
  handle("activity:list", (_e, limit) =>
    recentService.listActivity(limit === undefined ? 20 : v.parse(z.number().int().min(1).max(100), limit))
  );

  // --- Clientes --------------------------------------------------------------------------
  handle("clients:list", (_e, search) =>
    clientService.listClients(search === undefined || search === null ? undefined : v.parse(z.string().max(200), search))
  );
  handle("clients:get", (_e, id) => clientService.getClient(v.parse(v.id, id)));
  handle("clients:create", (_e, input) => clientService.createClient(v.parse(v.clientCreate, input)));
  handle("clients:update", (_e, id, patch) => clientService.updateClient(v.parse(v.id, id), v.parse(v.clientUpdate, patch)));
  handle("clients:delete", (_e, id) => clientService.deleteClient(v.parse(v.id, id)));

  // --- Marketing ---------------------------------------------------------------------------
  handle("marketing:list", (_e, filter) =>
    marketingService.listMarketingContent(
      filter === undefined || filter === null
        ? undefined
        : v.parse(z.object({ clientId: v.id.optional(), from: v.isoDate.optional(), to: v.isoDate.optional() }), filter)
    )
  );
  handle("marketing:create", (_e, input) => marketingService.createMarketingContent(v.parse(v.marketingCreate, input)));
  handle("marketing:update", (_e, id, patch) =>
    marketingService.updateMarketingContent(v.parse(v.id, id), v.parse(v.marketingUpdate, patch))
  );
  handle("marketing:delete", (_e, id) => marketingService.deleteMarketingContent(v.parse(v.id, id)));

  // --- Agenda ----------------------------------------------------------------------------------
  handle("calendar:list", (_e, range) =>
    calendarService.listEvents(range === undefined || range === null ? undefined : v.parse(v.dateRange, range))
  );
  handle("calendar:create", (_e, input) => calendarService.createEvent(v.parse(v.eventCreate, input)));
  handle("calendar:update", (_e, id, patch) => calendarService.updateEvent(v.parse(v.id, id), v.parse(v.eventUpdate, patch)));
  handle("calendar:delete", (_e, id) => calendarService.deleteEvent(v.parse(v.id, id)));

  // --- IA --------------------------------------------------------------------------------------
  handle("ai:providers", () => aiService.listProviderStatus());
  handle("ai:refreshModels", (_e, provider) => aiService.refreshModels(v.parse(v.aiProvider, provider)));
  handle("ai:connect", (_e, provider, apiKey) =>
    aiService.connectProvider(v.parse(v.aiProvider, provider), v.parse(z.string().trim().min(10).max(500), apiKey))
  );
  handle("ai:disconnect", (_e, provider) => aiService.disconnectProvider(v.parse(v.aiProvider, provider)));
  handle("ai:test", (_e, provider) => aiService.testProvider(v.parse(v.aiProvider, provider)));
  handle("ai:subscriptions:list", () => aiService.listSubscriptionClis());
  handle("ai:limits", (_e, force) => getSubscriptionLimits(force === undefined || force === null ? false : v.parse(z.boolean(), force)));
  handle("ai:connectSubscription", (_e, provider) => aiService.connectSubscription(v.parse(z.enum(["anthropic", "openai"]), provider)));
  handle("ai:conversations:list", (_e, projectId) =>
    aiService.listConversations(projectId === undefined || projectId === null ? undefined : v.parse(v.id, projectId))
  );
  handle("ai:conversations:create", (_e, input) => aiService.createConversation(v.parse(v.conversationCreate, input)));
  handle("ai:conversations:update", (_e, id, patch) =>
    aiService.updateConversation(
      v.parse(v.id, id),
      v.parse(z.object({ title: v.nonEmpty(200).optional(), model: v.nonEmpty(120).optional(), provider: v.aiProvider.optional() }), patch)
    )
  );
  handle("ai:conversations:delete", (_e, id) => aiService.deleteConversation(v.parse(v.id, id)));
  handle("ai:messages:list", (_e, id) => aiService.listMessages(v.parse(v.id, id)));
  handle("ai:send", (e, requestId, input) => aiService.sendMessage(e.sender, v.parse(v.id, requestId), v.parse(v.sendMessage, input)));
  handle("ai:regenerate", (e, requestId, conversationId) =>
    aiService.regenerate(e.sender, v.parse(v.id, requestId), v.parse(v.id, conversationId))
  );
  handle("ai:interrupt", (_e, requestId) => aiService.interruptRequest(v.parse(v.id, requestId)));
  handle("ai:council:run", (e, input) => {
    const parsed = v.parse(v.councilRun, input);
    // Proteção contra custo acidental: o número de providers confirmado pelo
    // usuário no diálogo precisa bater exatamente com o que será disparado.
    if (parsed.confirmedCount !== parsed.targets.length) {
      throw new Error("A quantidade de providers não confere com a confirmada. Nada foi enviado.");
    }
    aiService.runCouncil(e.sender, parsed);
  });
  handle("ai:council:synthesize", (e, input) => aiService.synthesizeCouncil(e.sender, v.parse(v.councilSynthesize, input)));

  // --- Uso da IA (tokens e custo estimado) ------------------------------------------
  handle("ai:usage:summary", (_e, days) =>
    usageService.getUsageSummary(days === null || days === undefined ? null : v.parse(z.number().int().min(1).max(366), days))
  );
  handle("ai:usage:clear", (_e, confirmed) => {
    requireConfirmation(confirmed);
    usageService.clearUsage();
  });

  // --- Comandos sugeridos pela IA ------------------------------------------------------------------
  handle("commands:assess", (_e, command) => commandService.assess(v.parse(z.string().max(4000), command)));
  handle("commands:run", (_e, input) => {
    const parsed = v.parse(v.commandRun, input);
    requireConfirmation(parsed.confirmed);
    return commandService.runCommand(parsed);
  });
  handle("commands:listAllowed", () => commandService.listAllowedCommands());
  handle("commands:revoke", (_e, command) => commandService.revokeAllowedCommand(v.parse(z.string().max(4000), command)));

  // --- Terminal integrado ------------------------------------------------------------------------------
  handle("terminal:available", () => terminalService.isTerminalAvailable());
  handle("terminal:create", (e, input) => terminalService.createSession(e.sender, v.parse(v.terminalCreate, input)));
  handle("terminal:write", (e, id, data) => terminalService.write(e.sender, v.parse(v.id, id), v.parse(z.string().max(100_000), data)));
  handle("terminal:resize", (e, id, cols, rows) =>
    terminalService.resize(
      e.sender,
      v.parse(v.id, id),
      v.parse(z.number().int().min(10).max(500), cols),
      v.parse(z.number().int().min(5).max(300), rows)
    )
  );
  handle("terminal:kill", (e, id) => terminalService.kill(e.sender, v.parse(v.id, id)));

  // --- Integrações ------------------------------------------------------------------------------------------
  handle("integrations:list", () => listIntegrationStatus());
  handle("github:connect", (_e, token) => github.connect(v.parse(z.string().trim().min(20).max(300), token)));
  handle("github:ghCliAvailable", () => github.ghCliAvailable());
  handle("notion:connect", (_e, token) => notion.connect(v.parse(z.string().trim().regex(/^(ntn_|secret_)[A-Za-z0-9]{20,120}$/, "Token do Notion inválido (começa com ntn_ ou secret_)"), token)));
  handle("notion:disconnect", () => notion.disconnect());
  handle("notion:test", () => notion.test());
  handle("notion:search", (_e, query, kind) => notion.search(v.parse(z.string().max(200), query ?? ""), v.parse(z.enum(["page", "database"]).optional(), kind)));
  handle("notion:page", (_e, id) => notion.page(v.parse(v.notionId, id)));
  handle("notion:createPage", (_e, input) => notion.createPage(v.parse(v.notionCreatePage, input)));
  handle("github:connectGhCli", () => github.connectWithGhCli());
  handle("media:state", () => localMedia.getLocalMedia());
  handle("media:control", (_e, action) => localMedia.controlLocalMedia(v.parse(z.enum(["play", "pause", "toggle", "next", "previous"]), action)));
  handle("media:seek", (_e, ms) => localMedia.seekLocalMedia(v.parse(z.number().int().min(0).max(24 * 3600 * 1000), ms)));
  handle("github:disconnect", () => github.disconnect());
  handle("github:test", () => github.test());
  handle("spotify:connect", (_e, input) => spotify.connect(v.parse(v.oauthClientConfig, input).clientId));
  handle("spotify:disconnect", () => spotify.disconnect());
  handle("spotify:playback", () => spotify.getPlayback());
  handle("spotify:control", (_e, action) => spotify.control(v.parse(v.spotifyAction, action)));
  handle("spotify:volume", (_e, percent) => spotify.setVolume(v.parse(z.number().min(0).max(100), percent)));
  handle("spotify:seek", (_e, ms) => spotify.seek(v.parse(z.number().min(0).max(24 * 3600 * 1000), ms)));
  handle("googleCalendar:connect", (_e, input) => {
    const parsed = v.parse(v.oauthClientConfig, input);
    if (!parsed.clientSecret) throw new Error("Informe o Client Secret do app OAuth do Google.");
    return googleCalendar.connect(parsed.clientId, parsed.clientSecret);
  });
  handle("googleCalendar:disconnect", () => googleCalendar.disconnect());
  handle("googleCalendar:sync", () => googleCalendar.sync());
}
