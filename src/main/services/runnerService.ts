import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createLogger } from "../logger.js";
import { EXTERNAL_COMMANDS } from "../security/commands.js";
import { killPid, runCapture, spawnStreaming } from "../security/exec.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { getProject } from "./projectService.js";
import { tt } from "../i18n.js";
import type { ListeningPort, PackageManager, ProjectScripts, RunnerProcess } from "../../shared/types.js";

/**
 * Runner de processos longos por projeto (servidor de dev, watch de testes...).
 *
 * Segurança:
 * - Só roda depois da confirmação na UI (`confirmed: true`, checado no handler).
 * - Script do package.json: o comando é FIXO (`& $env:QYREX_RUN_PM run $env:QYREX_RUN_SCRIPT`)
 *   e o nome do script entra por variável de ambiente, nunca concatenado no texto
 *   que o PowerShell interpreta. O gerenciador vem de uma lista fechada.
 * - Comando livre: vai como um único argumento `-Command`, exatamente como foi
 *   exibido ao usuário (o mesmo modelo de `commandService.executeConfirmed`).
 * - "Reiniciar" repete o comando já confirmado guardado AQUI no main; o renderer
 *   não consegue trocar o que roda.
 * - Ao fechar o app, tudo o que o runner abriu é encerrado (árvore inteira).
 */

const log = createLogger("runner");

const MAX_RUNNING = 12;
const MAX_KEPT = 30;
const MAX_BUFFER = 256_000;
const FLUSH_MS = 50;

interface Entry {
  info: RunnerProcess;
  /** Como rodar de novo (já confirmado): script do package.json ou comando livre. */
  spec: { kind: "script"; pm: PackageManager; script: string } | { kind: "command"; command: string };
  buffer: string;
  pending: string;
  stop: (() => void) | null;
  stopRequested: boolean;
}

const entries = new Map<string, Entry>();
let flushTimer: NodeJS.Timeout | null = null;

type RunnerEvent = { type: "changed"; processes: RunnerProcess[] } | { type: "data"; id: string; chunk: string };
let listener: ((event: RunnerEvent) => void) | null = null;

export function setRunnerListener(fn: ((event: RunnerEvent) => void) | null): void {
  listener = fn;
}

function emitChanged(): void {
  listener?.({ type: "changed", processes: listProcesses() });
}

/** Junta a saída em lotes curtos: um build barulhento não afoga o IPC. */
function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    for (const [id, entry] of entries) {
      if (!entry.pending) continue;
      const chunk = entry.pending;
      entry.pending = "";
      listener?.({ type: "data", id, chunk });
    }
  }, FLUSH_MS);
}

// --- Leitura da pasta --------------------------------------------------------------

export function detectPackageManager(dir: string): PackageManager {
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock"))) return "bun";
  return "npm";
}

function projectDir(projectId: string): { dir: string; name: string } {
  const project = getProject(projectId);
  if (!project) throw new Error("Projeto não encontrado.");
  return { dir: assertPathAllowedAndExists(project.localPath), name: project.name };
}

function readScripts(dir: string): Record<string, string> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as { scripts?: unknown };
    if (!pkg.scripts || typeof pkg.scripts !== "object") return {};
    return Object.fromEntries(Object.entries(pkg.scripts).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {}; // sem package.json (ou inválido)
  }
}

export function getProjectScripts(projectId: string): ProjectScripts {
  const { dir } = projectDir(projectId);
  const scripts = readScripts(dir);
  return { packageManager: detectPackageManager(dir), scripts: Object.entries(scripts).map(([name, command]) => ({ name, command })) };
}

// --- Saída -------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g;
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d{1,5})?(?:\/[^\s'"<>`)]*)?/gi;

/** Endereços locais anunciados na saída (Vite, Next, Express...), sem repetir. */
export function extractLocalUrls(text: string, known: string[] = []): string[] {
  const found = new Set(known);
  for (const match of text.replace(ANSI, "").matchAll(LOCAL_URL)) {
    // 0.0.0.0 não abre no navegador: vira localhost.
    found.add(match[0].replace(/\/\/0\.0\.0\.0/, "//localhost").replace(/[.,;:]+$/, ""));
  }
  return [...found].slice(0, 6);
}

function snapshot(entry: Entry): RunnerProcess {
  return { ...entry.info, urls: [...entry.info.urls] };
}

export function listProcesses(): RunnerProcess[] {
  return [...entries.values()].map(snapshot).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getOutput(id: string): string {
  const entry = entries.get(id);
  if (!entry) throw new Error("Processo não encontrado.");
  return entry.buffer;
}

// --- Ciclo de vida -----------------------------------------------------------------

function displayCommand(spec: Entry["spec"]): string {
  return spec.kind === "script" ? `${spec.pm} run ${spec.script}` : spec.command;
}

function launch(entry: Entry, dir: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "1" };
  let args: string[];
  if (entry.spec.kind === "script") {
    env.QYREX_RUN_PM = entry.spec.pm;
    env.QYREX_RUN_SCRIPT = entry.spec.script;
    args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "& $env:QYREX_RUN_PM run $env:QYREX_RUN_SCRIPT"];
  } else {
    args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", entry.spec.command];
  }

  entry.info.status = "running";
  entry.info.exitCode = null;
  entry.info.endedAt = null;
  entry.info.startedAt = new Date().toISOString();
  entry.info.urls = [];
  entry.stopRequested = false;
  entry.buffer = `\x1b[2m> ${entry.info.command}\x1b[0m\r\n`;
  entry.pending = entry.buffer;

  const proc = spawnStreaming(EXTERNAL_COMMANDS.powershell, args, {
    cwd: dir,
    env,
    onData: (chunk) => {
      entry.buffer = (entry.buffer + chunk).slice(-MAX_BUFFER);
      entry.pending += chunk;
      const urls = extractLocalUrls(chunk, entry.info.urls);
      if (urls.length !== entry.info.urls.length) {
        entry.info.urls = urls;
        emitChanged();
      }
      scheduleFlush();
    },
    onExit: (code) => {
      entry.stop = null;
      entry.info.exitCode = code;
      entry.info.endedAt = new Date().toISOString();
      entry.info.status = entry.stopRequested ? "stopped" : code === 0 ? "exited" : "failed";
      entry.info.pid = null;
      const note = entry.info.status === "stopped" ? tt("encerrado") : tt("saiu com código {code}", { code: code ?? "?" });
      const line = `\r\n\x1b[2m[${note}]\x1b[0m\r\n`;
      entry.buffer = (entry.buffer + line).slice(-MAX_BUFFER);
      entry.pending += line;
      scheduleFlush();
      emitChanged();
    },
  });
  entry.stop = proc.stop;
  entry.info.pid = proc.pid ?? null;
  log.info(`runner: ${entry.info.projectName} → ${entry.info.command}`);
}

function pruneFinished(): void {
  const finished = [...entries.values()].filter((e) => e.info.status !== "running").sort((a, b) => a.info.startedAt.localeCompare(b.info.startedAt));
  while (entries.size > MAX_KEPT && finished.length > 0) entries.delete(finished.shift()!.info.id);
}

/** Roda um script do package.json ou um comando livre. Só depois da confirmação na UI. */
export function start(input: { projectId: string; script?: string; command?: string }): RunnerProcess {
  const { dir, name } = projectDir(input.projectId);
  const running = [...entries.values()].filter((e) => e.info.status === "running");
  if (running.length >= MAX_RUNNING) throw new Error("Muitos processos rodando. Encerre algum antes.");

  let spec: Entry["spec"];
  if (input.script) {
    if (!Object.prototype.hasOwnProperty.call(readScripts(dir), input.script)) throw new Error("Script não encontrado no package.json.");
    spec = { kind: "script", pm: detectPackageManager(dir), script: input.script };
    // O mesmo script do mesmo projeto não sobe duas vezes (a porta já estaria ocupada).
    const dup = running.find((e) => e.info.projectId === input.projectId && e.spec.kind === "script" && e.spec.script === input.script);
    if (dup) return snapshot(dup);
  } else if (input.command?.trim()) {
    spec = { kind: "command", command: input.command.trim() };
  } else {
    throw new Error("Escolha um script ou digite um comando.");
  }

  const entry: Entry = {
    info: {
      id: randomUUID(),
      projectId: input.projectId,
      projectName: name,
      script: spec.kind === "script" ? spec.script : null,
      command: displayCommand(spec),
      status: "running",
      exitCode: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      urls: [],
      pid: null,
    },
    spec,
    buffer: "",
    pending: "",
    stop: null,
    stopRequested: false,
  };
  entries.set(entry.info.id, entry);
  launch(entry, dir);
  pruneFinished();
  emitChanged();
  return snapshot(entry);
}

export function stop(id: string): void {
  const entry = entries.get(id);
  if (!entry) throw new Error("Processo não encontrado.");
  if (entry.info.status !== "running") return;
  entry.stopRequested = true;
  entry.stop?.();
}

/** Repete o comando já confirmado deste processo (encerra antes, se ainda roda). */
export async function restart(id: string): Promise<RunnerProcess> {
  const entry = entries.get(id);
  if (!entry) throw new Error("Processo não encontrado.");
  const { dir } = projectDir(entry.info.projectId);
  if (entry.info.status === "running") {
    await new Promise<void>((resolve) => {
      const started = Date.now();
      stop(id);
      const wait = setInterval(() => {
        if (entry.info.status !== "running" || Date.now() - started > 5000) {
          clearInterval(wait);
          resolve();
        }
      }, 100);
    });
  }
  launch(entry, dir);
  emitChanged();
  return snapshot(entry);
}

export function remove(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;
  if (entry.info.status === "running") throw new Error("Encerre o processo antes de removê-lo.");
  entries.delete(id);
  emitChanged();
}

export function stopAll(): void {
  for (const entry of entries.values()) {
    if (entry.info.status === "running") {
      entry.stopRequested = true;
      entry.stop?.();
    }
  }
}

// --- Portas ------------------------------------------------------------------------

/** Processos do sistema que nunca aparecem (nem podem ser encerrados) pelo painel de portas. */
const PROTECTED_PROCESSES = new Set(["system", "svchost.exe", "lsass.exe", "wininit.exe", "services.exe", "spoolsv.exe", "csrss.exe", "smss.exe", "winlogon.exe"]);

/**
 * Linhas TCP em escuta do `netstat -ano`. A coluna de estado vem traduzida no
 * Windows em português, então a escuta é reconhecida pelo endereço remoto com porta 0.
 */
export function parseNetstat(raw: string): { port: number; address: string; pid: number }[] {
  const seen = new Set<string>();
  const out: { port: number; address: string; pid: number }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols[0]?.toUpperCase() !== "TCP" || cols.length < 5) continue;
    const [, local, remote] = cols;
    const pid = Number(cols[cols.length - 1]);
    if (!/:0$/.test(remote) || !Number.isInteger(pid)) continue;
    const sep = local.lastIndexOf(":");
    const port = Number(local.slice(sep + 1));
    if (!Number.isInteger(port) || port <= 0) continue;
    const key = `${port}:${pid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ port, address: local.slice(0, sep), pid });
  }
  return out.sort((a, b) => a.port - b.port);
}

/** `tasklist /FO CSV /NH`: "nome.exe","1234",... → mapa PID → nome. */
export function parseTasklist(raw: string): Map<number, string> {
  const names = new Map<number, string>();
  for (const line of raw.split(/\r?\n/)) {
    const m = /^"([^"]+)","(\d+)"/.exec(line.trim());
    if (m) names.set(Number(m[2]), m[1]);
  }
  return names;
}

function ownPids(): Set<number> {
  const pids = new Set<number>([process.pid]);
  try {
    for (const metric of app.getAppMetrics()) pids.add(metric.pid);
  } catch {
    // fora do Electron (testes): só o próprio processo
  }
  return pids;
}

async function readPorts(): Promise<ListeningPort[]> {
  if (process.platform !== "win32") return [];
  const [net, tasks] = await Promise.all([
    runCapture("netstat.exe", ["-ano", "-p", "TCP"], { timeoutMs: 10_000 }).then(async (v4) => {
      const v6 = await runCapture("netstat.exe", ["-ano", "-p", "TCPv6"], { timeoutMs: 10_000 }).catch(() => ({ stdout: "" }));
      return `${v4.stdout}\n${v6.stdout}`;
    }),
    runCapture("tasklist.exe", ["/FO", "CSV", "/NH"], { timeoutMs: 10_000 }),
  ]);
  const names = parseTasklist(tasks.stdout);
  const own = ownPids();
  const runners = [...entries.values()].filter((e) => e.info.status === "running");
  const byPort = new Map<number, ListeningPort>();
  for (const row of parseNetstat(net)) {
    const name = names.get(row.pid) ?? null;
    // Só portas de aplicativo (fora da faixa dinâmica) e nada do sistema ou do próprio Qyrex.
    if (row.pid <= 4 || own.has(row.pid) || row.port >= 49152) continue;
    if (name && PROTECTED_PROCESSES.has(name.toLowerCase())) continue;
    if (byPort.has(row.port)) continue;
    const runner = runners.find((e) => e.info.urls.some((u) => new RegExp(`:${row.port}(?:/|$)`).test(u)));
    byPort.set(row.port, { ...row, processName: name, runnerId: runner?.info.id ?? null });
  }
  return [...byPort.values()];
}

export function listPorts(): Promise<ListeningPort[]> {
  return readPorts();
}

/**
 * Encerra o processo dono de uma porta (depois da confirmação). Confere de novo,
 * na hora, que aquele PID ainda escuta naquela porta: a lista da UI pode estar velha.
 */
export async function killPort(port: number, pid: number): Promise<void> {
  const current = await readPorts();
  const match = current.find((p) => p.port === port && p.pid === pid);
  if (!match) throw new Error("Esse processo não está mais usando a porta.");
  await killPid(pid);
  log.info(`runner: porta ${port} liberada (pid ${pid}, ${match.processName ?? "?"})`);
}
