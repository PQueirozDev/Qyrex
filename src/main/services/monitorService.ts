import os from "node:os";
import { app } from "electron";
import { EXTERNAL_COMMANDS } from "../security/commands.js";
import { runCapture } from "../security/exec.js";
import { listProcesses } from "./runnerService.js";
import type { MonitorSample } from "../../shared/types.js";

/**
 * Monitor de recursos: CPU e RAM do sistema, do próprio Qyrex e de cada processo
 * do runner (a árvore inteira: o PowerShell, o npm e o node que ele abriu).
 * Só coleta quando a UI pede (página visível), no intervalo escolhido; nada roda em segundo plano.
 */

/** Script FIXO (sem nenhuma entrada do usuário): PID, pai, memória e tempo de CPU de cada processo. */
const PROCESS_SCRIPT =
  "Get-CimInstance Win32_Process | ForEach-Object { '{0},{1},{2},{3}' -f $_.ProcessId, $_.ParentProcessId, $_.WorkingSetSize, ($_.KernelModeTime + $_.UserModeTime) }";

interface ProcRow {
  pid: number;
  ppid: number;
  memory: number;
  /** Tempo de CPU acumulado, em unidades de 100 ns. */
  cpuTime: number;
}

/** Lê a saída do script acima. Exportado para testes. */
export function parseProcessRows(raw: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.trim().split(",");
    if (parts.length !== 4) continue;
    const [pid, ppid, memory, cpuTime] = parts.map(Number);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    rows.push({ pid, ppid, memory: memory || 0, cpuTime: cpuTime || 0 });
  }
  return rows;
}

/** Todos os PIDs da árvore a partir de `root` (o próprio incluído). Exportado para testes. */
export function treeOf(root: number, rows: ProcRow[]): number[] {
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.pid === r.ppid) continue;
    children.set(r.ppid, [...(children.get(r.ppid) ?? []), r.pid]);
  }
  const out: number[] = [];
  const seen = new Set<number>();
  const stack = [root];
  while (stack.length) {
    const pid = stack.pop()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push(pid);
    stack.push(...(children.get(pid) ?? []));
  }
  return out;
}

let lastCpu: { idle: number; total: number } | null = null;
let lastProc: { at: number; times: Map<number, number> } | null = null;

function systemCpuPercent(): number {
  const cpus = os.cpus();
  const idle = cpus.reduce((a, c) => a + c.times.idle, 0);
  const total = cpus.reduce((a, c) => a + c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle, 0);
  const prev = lastCpu;
  lastCpu = { idle, total };
  if (!prev || total === prev.total) return 0;
  return Math.max(0, Math.min(100, (1 - (idle - prev.idle) / (total - prev.total)) * 100));
}

export async function sample(): Promise<MonitorSample> {
  const now = Date.now();
  const memTotal = os.totalmem();
  const memUsed = memTotal - os.freemem();
  const metrics = app.getAppMetrics();
  const appCpu = metrics.reduce((a, m) => a + m.cpu.percentCPUUsage, 0);
  const appMem = metrics.reduce((a, m) => a + m.memory.workingSetSize, 0) * 1024;

  const running = listProcesses().filter((p) => p.status === "running" && p.pid);
  const processes: MonitorSample["processes"] = [];
  if (running.length > 0 && process.platform === "win32") {
    const res = await runCapture(EXTERNAL_COMMANDS.powershell, ["-NoProfile", "-NonInteractive", "-Command", PROCESS_SCRIPT], {
      timeoutMs: 15_000,
      maxOutputBytes: 4_000_000,
    }).catch(() => null);
    const rows = res ? parseProcessRows(res.stdout) : [];
    const byPid = new Map(rows.map((r) => [r.pid, r]));
    const times = new Map(rows.map((r) => [r.pid, r.cpuTime]));
    const elapsed = lastProc ? now - lastProc.at : 0;
    const cores = os.cpus().length || 1;
    for (const p of running) {
      const tree = treeOf(p.pid!, rows).filter((pid) => byPid.has(pid));
      let memory = 0;
      let cpuDelta = 0;
      for (const pid of tree) {
        memory += byPid.get(pid)!.memory;
        const before = lastProc?.times.get(pid);
        if (before !== undefined) cpuDelta += Math.max(0, byPid.get(pid)!.cpuTime - before);
      }
      // 100 ns → ms; dividido pelo tempo real e pelos núcleos = % do PC inteiro.
      const cpu = elapsed > 0 ? Math.min(100, (cpuDelta / 10_000 / elapsed / cores) * 100) : 0;
      processes.push({ runnerId: p.id, pid: p.pid!, processCount: tree.length, cpu, memory });
    }
    lastProc = { at: now, times };
  }

  return {
    at: new Date(now).toISOString(),
    cpu: systemCpuPercent(),
    cores: os.cpus().length,
    memUsed,
    memTotal,
    app: { cpu: Math.min(100, appCpu / (os.cpus().length || 1)), memory: appMem },
    processes,
  };
}
