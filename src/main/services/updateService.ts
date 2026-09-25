import { app, type WebContents } from "electron";
import { autoUpdater } from "electron-updater";
import { getSettings } from "../database/db.js";
import { createLogger } from "../logger.js";
import type { UpdateStatus } from "../../shared/types.js";
import { tm } from "../../shared/i18n.js";

const log = createLogger("updater");

/**
 * Atualização automática via electron-updater.
 *
 * - Origem: GitHub Releases de PQueirozDev/QrzSpace-releases (repositório
 *   público que contém SÓ os instaladores; o código segue privado). A origem
 *   fica gravada no próprio app (app-update.yml), não vem de input do usuário.
 * - Integridade: todo download é conferido pelo SHA-512 publicado no
 *   latest.yml da release, baixado via HTTPS.
 * - Nunca faz downgrade.
 * - Com "Atualizar automaticamente" ligado, baixa em segundo plano ao abrir o
 *   app e a UI mostra uma contagem para reiniciar (que o usuário pode adiar).
 */

let status: UpdateStatus = { state: "idle" };
let listener: ((s: UpdateStatus) => void) | null = null;
let initialized = false;

function setStatus(next: UpdateStatus): void {
  status = next;
  listener?.(next);
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export function attachUpdateListener(target: WebContents): void {
  listener = (s) => {
    if (!target.isDestroyed()) target.send("update:status", s);
  };
}

function isSupported(): { ok: true } | { ok: false; reason: string } {
  if (!app.isPackaged && !process.env.QRZ_UPDATE_TEST_URL) {
    return { ok: false, reason: tm("Atualizações só funcionam no app instalado.") };
  }
  if (process.platform !== "win32" && !process.env.APPIMAGE) {
    return { ok: false, reason: tm("Atualização automática disponível apenas no Windows.") };
  }
  return { ok: true };
}

function init(): void {
  if (initialized) return;
  initialized = true;

  // O electron-updater despeja respostas HTTP inteiras (com cabeçalhos e
  // cookies) nos erros: registramos só a primeira linha, já sem segredos.
  autoUpdater.logger = {
    info: (m: unknown) => log.info(firstLine(m)),
    warn: (m: unknown) => log.warn(firstLine(m)),
    error: (m: unknown) => log.error(firstLine(m)),
    debug: () => undefined,
  };
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Somente para testar o fluxo localmente: feed num servidor em 127.0.0.1.
  // Qualquer outro endereço é ignorado — a origem de produção é fixa no app.
  const testUrl = process.env.QRZ_UPDATE_TEST_URL;
  if (testUrl && /^http:\/\/127\.0\.0\.1:\d+\/?/.test(testUrl)) {
    autoUpdater.forceDevUpdateConfig = !app.isPackaged;
    autoUpdater.setFeedURL({ provider: "generic", url: testUrl });
    log.warn("Feed de atualização de TESTE ativo (localhost).");
  }

  autoUpdater.on("checking-for-update", () => setStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) => setStatus({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", (info) => setStatus({ state: "not-available", version: info.version }));
  autoUpdater.on("download-progress", (p) =>
    setStatus({ state: "downloading", version: status.state === "available" || status.state === "downloading" ? status.version : "", percent: Math.round(p.percent) })
  );
  autoUpdater.on("update-downloaded", (info) => {
    log.info(`Atualização ${info.version} baixada e verificada.`);
    setStatus({ state: "downloaded", version: info.version });
  });
  autoUpdater.on("error", (err) => {
    log.warn("Falha na atualização:", firstLine(err));
    setStatus({ state: "error", message: friendlyError(err) });
  });
}

/** Primeira linha da mensagem, limitada — nunca o corpo/cabeçalhos da resposta. */
export function firstLine(value: unknown): string {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  return text.split(/\r?\n/)[0].slice(0, 300);
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|net::ERR/i.test(msg)) return tm("Sem conexão para verificar atualizações.");
  if (/404/.test(msg)) return tm("Nenhuma versão publicada ainda.");
  if (/sha512|checksum/i.test(msg)) return tm("O download não passou na verificação de integridade e foi descartado.");
  return tm("Não foi possível atualizar agora.");
}

/**
 * Verifica (e, se `download`, baixa) atualizações. Chamado no startup quando
 * "Atualizar automaticamente" está ligado, ou pelo botão em Configurações.
 */
export async function checkForUpdates(download: boolean): Promise<UpdateStatus> {
  const support = isSupported();
  if (!support.ok) {
    setStatus({ state: "disabled", reason: support.reason });
    return status;
  }
  init();
  autoUpdater.autoDownload = download;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setStatus({ state: "error", message: friendlyError(err) });
  }
  return status;
}

export async function downloadUpdate(): Promise<void> {
  init();
  await autoUpdater.downloadUpdate();
}

/** Reinicia instalando a versão já baixada e verificada. */
export function installUpdate(): void {
  if (status.state !== "downloaded") throw new Error("Nenhuma atualização pronta para instalar.");
  log.info("Reiniciando para instalar a atualização.");
  // isSilent = true (sem assistente), isForceRunAfter = true (reabre o app).
  autoUpdater.quitAndInstall(true, true);
}

export function startAutoUpdate(): void {
  if (!getSettings().autoUpdate) return;
  // Aguarda o app terminar de abrir para não disputar recursos no startup.
  setTimeout(() => void checkForUpdates(true), 8_000);
}
