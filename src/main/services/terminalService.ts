import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { WebContents } from "electron";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { EXTERNAL_COMMANDS } from "../security/commands.js";
import { getSettings } from "../database/db.js";
import { createLogger } from "../logger.js";

const log = createLogger("terminal");

/**
 * Terminal integrado (xterm.js no renderer ↔ node-pty aqui).
 * - Só abre em pastas autorizadas.
 * - Só PowerShell ou CMD (shell fixo, sem argumentos vindos do renderer).
 * - O que o USUÁRIO digita vai direto para o pty, como num terminal comum;
 *   comandos vindos da IA NUNCA são escritos aqui automaticamente.
 */

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

interface Session {
  pty: Pty;
  owner: WebContents;
}

const sessions = new Map<string, Session>();
const MAX_SESSIONS = 8;

export function createSession(
  owner: WebContents,
  input: { cwd: string; shell?: "powershell" | "cmd"; cols: number; rows: number }
): { id: string; shell: string; cwd: string } {
  const pty = loadPty();
  if (!pty) throw new Error("Terminal integrado indisponível neste sistema.");
  if (sessions.size >= MAX_SESSIONS) throw new Error(`Limite de ${MAX_SESSIONS} terminais abertos atingido.`);

  const cwd = assertPathAllowedAndExists(input.cwd);
  if (!fs.statSync(cwd).isDirectory()) throw new Error("Selecione uma pasta.");
  const shell = input.shell ?? getSettings().defaultTerminal;
  const file = shell === "cmd" ? EXTERNAL_COMMANDS.cmd : EXTERNAL_COMMANDS.powershell;
  const args = shell === "cmd" ? [] : ["-NoLogo"];

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const proc = pty.spawn(file, args, { name: "xterm-256color", cols: input.cols, rows: input.rows, cwd, env });
  const id = randomUUID();
  sessions.set(id, { pty: proc, owner });

  proc.onData((data) => {
    if (!owner.isDestroyed()) owner.send("terminal:data", { id, data });
  });
  proc.onExit(({ exitCode }) => {
    sessions.delete(id);
    if (!owner.isDestroyed()) owner.send("terminal:exit", { id, exitCode });
  });

  log.info(`Terminal ${shell} aberto`);
  return { id, shell, cwd };
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
