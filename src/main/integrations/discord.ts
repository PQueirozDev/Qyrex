import net from "node:net";
import { randomUUID } from "node:crypto";
import { getSettings } from "../database/db.js";
import { tm, translate } from "../../shared/i18n.js";
import { createLogger } from "../logger.js";
import type { DiscordStatus } from "../../shared/types.js";
import { testApiBase } from "./endpoints.js";

const log = createLogger("discord");

/**
 * Discord Rich Presence ("Jogando Qyrex") via o protocolo IPC local do
 * próprio app do Discord: um named pipe `\\?\pipe\discord-ipc-N` com frames
 * [opcode int32 LE][tamanho int32 LE][JSON]. Nada sai para a internet a partir
 * do Workspace; quem publica o status é o cliente do Discord do usuário.
 *
 * Privacidade: por padrão só aparece a ÁREA do app (ex.: "Projetos"). O nome
 * do projeto só é enviado se o usuário ligar essa opção.
 */

enum Op {
  Handshake = 0,
  Frame = 1,
  Close = 2,
}

const RETRY_MS = 30_000;

let socket: net.Socket | null = null;
let status: DiscordStatus = "disabled";
let ready = false;
let buffer: Buffer = Buffer.alloc(0);
let retryTimer: NodeJS.Timeout | null = null;
let startedAt = Date.now();
let currentClientId: string | null = null;
let lastActivity: { page: string; project: string | null } = { page: "inicio", project: null };
let statusListener: ((s: DiscordStatus) => void) | null = null;

function setStatus(next: DiscordStatus): void {
  if (status === next) return;
  status = next;
  log.info(`Discord: ${next}`);
  statusListener?.(next);
}

export function getDiscordStatus(): DiscordStatus {
  return status;
}

export function onDiscordStatus(listener: (s: DiscordStatus) => void): void {
  statusListener = listener;
}

export function encodeFrame(op: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), "utf-8");
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

/** Separa frames completos de um buffer acumulado. Exportado para testes. */
export function decodeFrames(data: Buffer): { frames: { op: number; payload: unknown }[]; rest: Buffer } {
  const frames: { op: number; payload: unknown }[] = [];
  let offset = 0;
  while (data.length - offset >= 8) {
    const op = data.readInt32LE(offset);
    const len = data.readInt32LE(offset + 4);
    if (len < 0 || len > 1_000_000) throw new Error("Frame do Discord inválido.");
    if (data.length - offset - 8 < len) break;
    const json = data.subarray(offset + 8, offset + 8 + len).toString("utf-8");
    try {
      frames.push({ op, payload: JSON.parse(json) });
    } catch {
      frames.push({ op, payload: null });
    }
    offset += 8 + len;
  }
  return { frames, rest: data.subarray(offset) };
}

function pipePath(index: number): string {
  if (process.platform === "win32") return `\\\\?\\pipe\\discord-ipc-${index}`;
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || "/tmp";
  return `${dir.replace(/\/$/, "")}/discord-ipc-${index}`;
}

function tryConnect(index: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.createConnection(pipePath(index));
    s.once("connect", () => resolve(s));
    s.once("error", reject);
  });
}

async function openSocket(): Promise<net.Socket | null> {
  for (let i = 0; i < 10; i++) {
    try {
      return await tryConnect(i);
    } catch {
      // tenta o próximo índice (várias instâncias do Discord: canary, ptb...)
    }
  }
  return null;
}

const PAGE_LABEL: Record<string, string> = {
  inicio: tm("No painel inicial"),
  ia: tm("Conversando com IA"),
  projetos: tm("Gerenciando projetos"),
  terminal: tm("No terminal"),
  arquivos: tm("Organizando arquivos"),
  agenda: tm("Planejando a agenda"),
  tarefas: tm("Organizando tarefas"),
  clientes: tm("Atendendo clientes"),
  marketing: tm("Criando conteúdo"),
  whatsapp: tm("No WhatsApp"),
  notion: tm("Organizando notas no Notion"),
  integracoes: tm("Configurando integrações"),
  configuracoes: tm("Nas configurações"),
  novidades: tm("Lendo as novidades"),
};

/** Monta a atividade exibida no perfil. Exportado para testes. */
/** Aplicativo oficial "Qyrex" no Discord Developer Portal (ID público). */
export const OFFICIAL_DISCORD_APP_ID = "1552906629085794356";
/**
 * Com o app oficial, a imagem vai como URL direta (o Discord aceita URLs https
 * externas): aparece mesmo sem o cache de recursos do app e acompanha o ícone
 * publicado no repositório público de releases. Com um Client ID próprio, usa a chave "qyrex".
 */
const OFFICIAL_LARGE_IMAGE = "https://raw.githubusercontent.com/PQueirozDev/QrzSpace-releases/main/icon.png";

export function largeImageFor(clientId: string | null): string {
  return clientId === OFFICIAL_DISCORD_APP_ID ? OFFICIAL_LARGE_IMAGE : "qyrex";
}

export function buildActivity(
  page: string,
  project: string | null,
  showProject: boolean,
  lang: "pt" | "en",
  start: number,
  clientId: string | null = OFFICIAL_DISCORD_APP_ID
) {
  const details = translate(lang, PAGE_LABEL[page] ?? tm("Trabalhando"));
  const state = showProject && project ? translate(lang, "Projeto: {name}", { name: project.slice(0, 100) }) : undefined;
  return {
    details,
    ...(state ? { state } : {}),
    timestamps: { start: Math.floor(start / 1000) },
    assets: { large_image: largeImageFor(clientId), large_text: "Qyrex" },
    instance: false,
  };
}

function send(op: Op, payload: unknown): void {
  if (socket && !socket.destroyed) socket.write(encodeFrame(op, payload));
}

function pushActivity(): void {
  if (!ready) return;
  const settings = getSettings();
  send(Op.Frame, {
    cmd: "SET_ACTIVITY",
    args: {
      pid: process.pid,
      activity: buildActivity(
        lastActivity.page,
        lastActivity.project,
        settings.discord.showProject,
        settings.language,
        startedAt,
        settings.discord.clientId
      ),
    },
    nonce: randomUUID(),
  });
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, RETRY_MS);
}

function teardown(): void {
  ready = false;
  buffer = Buffer.alloc(0);
  if (socket) {
    socket.removeAllListeners();
    socket.destroy();
    socket = null;
  }
}

async function connect(): Promise<void> {
  const { discord } = getSettings();
  // Nos testes E2E (servidor de simulação) nunca mexe no Discord real de quem roda.
  if (!discord.enabled || !discord.clientId || testApiBase()) {
    setStatus("disabled");
    return;
  }
  if (socket) return;
  setStatus("connecting");
  const s = await openSocket();
  if (!s) {
    setStatus("discord-not-running");
    scheduleRetry(); // Discord fechado: tenta de novo em 30s, sem ficar martelando
    return;
  }
  socket = s;
  currentClientId = discord.clientId;
  s.on("data", (chunk: Buffer) => {
    try {
      const { frames, rest } = decodeFrames(Buffer.concat([buffer, chunk]));
      buffer = rest;
      for (const frame of frames) {
        const payload = frame.payload as { evt?: string; data?: { message?: string } } | null;
        if (frame.op === Op.Close) {
          log.warn("Discord recusou a conexão:", payload?.data?.message ?? "sem detalhes");
          setStatus("error");
          teardown();
          return;
        }
        if (payload?.evt === "READY") {
          ready = true;
          setStatus("connected");
          pushActivity();
        } else if (payload?.evt === "ERROR") {
          log.warn("Erro do Discord RPC:", payload.data?.message ?? "");
        }
      }
    } catch (err) {
      log.warn("Resposta inválida do Discord:", err);
      teardown();
      setStatus("error");
    }
  });
  s.on("close", () => {
    teardown();
    if (getSettings().discord.enabled) {
      setStatus("discord-not-running");
      scheduleRetry();
    }
  });
  s.on("error", () => undefined); // tratado em "close"
  send(Op.Handshake, { v: 1, client_id: discord.clientId });
}

/** Aplica as configurações atuais: conecta, reconecta com outro Client ID ou desliga. */
export function applyDiscordSettings(): void {
  const { discord } = getSettings();
  if (!discord.enabled || !discord.clientId) {
    if (ready) send(Op.Frame, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: null }, nonce: randomUUID() });
    teardown();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    setStatus("disabled");
    return;
  }
  if (socket && currentClientId !== discord.clientId) teardown();
  if (!socket) {
    startedAt = Date.now();
    void connect();
  } else {
    pushActivity();
  }
}

/** Chamado pelo renderer ao trocar de página/projeto. */
export function setDiscordActivity(page: string, project: string | null): void {
  lastActivity = { page, project };
  pushActivity();
}

export function stopDiscord(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  teardown();
}
