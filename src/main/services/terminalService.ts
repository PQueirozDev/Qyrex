import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { WebContents } from "electron";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { EXTERNAL_COMMANDS } from "../security/commands.js";
import { getSettings } from "../database/db.js";
import { childEnv, find } from "../integrations/cli/subscriptions.js";
import { showNotification } from "./notificationService.js";
import { tt } from "../i18n.js";
import { createLogger } from "../logger.js";

const log = createLogger("terminal");

/**
 * Terminal integrado (xterm.js no renderer ↔ node-pty aqui).
 * - Só abre em pastas autorizadas.
 * - PowerShell, CMD ou um agente (Claude Code / Codex): o executável é fixo e
 *   achado aqui; o renderer só escolhe o tipo, nunca manda caminho nem argumento.
 * - O que o USUÁRIO digita vai direto para o pty, como num terminal comum;
 *   comandos vindos da IA do Qyrex NUNCA são escritos aqui automaticamente.
 *   O agente aberto aqui é o mesmo que o usuário abriria digitando `claude`
 *   no PowerShell: ele pede as próprias permissões na tela.
 */

export type TerminalKind = "powershell" | "cmd" | "claude" | "codex";

type Pty = {
  onData: (cb: (data: string) => void) => { dispose: () => void };
  onExit: (cb: (e: { exitCode: number }) => void) => { dispose: () => void };
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
};
type PtyModule = {
  spawn: (file: string, args: string[], options: { name: string; cols: number; rows: number; cwd: string; env: NodeJS.ProcessEnv }) => Pty;
};

let ptyModule: PtyModule | null | undefined;

function loadPty(): PtyModule | null {
  if (ptyModule !== undefined) return ptyModule;
  try {
    // Carregado sob demanda: só paga o custo do módulo nativo quem usa o terminal.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ptyModule = require("@lydell/node-pty") as PtyModule;
  } catch (err) {
    log.warn("node-pty indisponível, terminal integrado desativado:", err);
    ptyModule = null;
  }
  return ptyModule;
}

export function isTerminalAvailable(): boolean {
  return process.platform === "win32" && loadPty() !== null;
}

/** Quais agentes dá para abrir no terminal (o binário oficial está instalado). */
export function listAgents(): { claude: boolean; codex: boolean } {
  return { claude: find("claude") !== null, codex: find("codex") !== null };
}

const KIND_LABEL: Record<TerminalKind, string> = { powershell: "PowerShell", cmd: "CMD", claude: "Claude Code", codex: "Codex" };

function resolveCommand(kind: TerminalKind): { file: string; args: string[] } {
  if (kind === "cmd") return { file: EXTERNAL_COMMANDS.cmd, args: [] };
  if (kind === "powershell") return { file: EXTERNAL_COMMANDS.powershell, args: ["-NoLogo"] };
  const exe = find(kind);
  if (!exe) throw new Error(kind === "claude" ? tt("Claude Code não encontrado neste PC.") : tt("Codex CLI não encontrado neste PC."));
  return { file: exe, args: [] };
}

interface Session {
  pty: Pty;
  owner: WebContents;
  kind: TerminalKind;
  cwd: string;
}

const sessions = new Map<string, Session>();
const MAX_SESSIONS = 8;

export function createSession(
  owner: WebContents,
  input: { cwd: string; shell?: TerminalKind; cols: number; rows: number }
): { id: string; shell: string; cwd: string } {
  const pty = loadPty();
  if (!pty) throw new Error("Terminal integrado indisponível neste sistema.");
  if (sessions.size >= MAX_SESSIONS) throw new Error(`Limite de ${MAX_SESSIONS} terminais abertos atingido.`);

  const cwd = assertPathAllowedAndExists(input.cwd);
  if (!fs.statSync(cwd).isDirectory()) throw new Error("Selecione uma pasta.");
  const kind = input.shell ?? getSettings().defaultTerminal;
  const { file, args } = resolveCommand(kind);

  const proc = pty.spawn(file, args, { name: "xterm-256color", cols: input.cols, rows: input.rows, cwd, env: childEnv() });
  const id = randomUUID();
  sessions.set(id, { pty: proc, owner, kind, cwd });

  proc.onData((data) => {
    if (!owner.isDestroyed()) owner.send("terminal:data", { id, data });
  });
  proc.onExit(({ exitCode }) => {
    sessions.delete(id);
    if (!owner.isDestroyed()) owner.send("terminal:exit", { id, exitCode });
  });

  log.info(`Terminal ${kind} aberto`);
  return { id, shell: kind, cwd };
}

function getOwned(owner: WebContents, id: string): Session {
  const session = sessions.get(id);
  if (!session || session.owner.id !== owner.id) throw new Error("Sessão de terminal não encontrada.");
  return session;
}

export function write(owner: WebContents, id: string, data: string): void {
  if (data.length > 100_000) throw new Error("Entrada grande demais para o terminal.");
  getOwned(owner, id).pty.write(data);
}

export function resize(owner: WebContents, id: string, cols: number, rows: number): void {
  getOwned(owner, id).pty.resize(cols, rows);
}

/**
 * Aviso do Windows de que um terminal terminou o trabalho (o renderer decide
 * quando: a aba não está na tela). O texto é montado aqui, a partir da sessão.
 */
export function notifyDone(owner: WebContents, id: string): void {
  const session = getOwned(owner, id);
  showNotification(KIND_LABEL[session.kind], tt("Terminou e está esperando você em {folder}.", { folder: path.basename(session.cwd) || session.cwd }), "terminal");
}

export function kill(owner: WebContents, id: string): void {
  const session = getOwned(owner, id);
  session.pty.kill();
  sessions.delete(id);
}

export function killAll(): void {
  for (const [id, session] of sessions) {
    try {
      session.pty.kill();
    } catch {
      // processo já encerrado
    }
    sessions.delete(id);
  }
}
