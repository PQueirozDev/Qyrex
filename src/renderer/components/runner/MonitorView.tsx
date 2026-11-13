import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Cpu, ExternalLink, MemoryStick, Square, TriangleAlert } from "lucide-react";
import type { MonitorSample } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, ProjectIcon } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { tr, trn } from "@/lib/i18n";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useRunnerStore } from "@/stores/useRunnerStore";
import { confirmAction } from "@/stores/useUIStore";

const HISTORY = 60;
const INTERVALS = [2000, 5000, 10000, 0] as const;
const INTERVAL_KEY = "qrz.monitorInterval";

/** Área do histórico (0–100%). A última leitura fica à direita. */
function AreaChart({ values, color, label }: { values: number[]; color: string; label: string }) {
  const w = 240;
  const h = 56;
  const pts = values.map((v, i) => [w - (values.length - 1 - i) * (w / (HISTORY - 1)), h - (Math.min(100, Math.max(0, v)) / 100) * (h - 2) - 1] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z` : "";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-14 w-full" role="img" aria-label={label}>
      {[25, 50, 75].map((g) => (
        <line key={g} x1={0} x2={w} y1={h - (g / 100) * h} y2={h - (g / 100) * h} stroke="rgb(var(--border-subtle))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
      {pts.length > 1 && (
        <>
          <path d={area} fill={`rgb(var(${color}) / 0.14)`} />
          <path d={line} fill="none" stroke={`rgb(var(${color}))`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function Stat({ icon: Icon, title, value, sub, values, color, warn }: { icon: typeof Cpu; title: string; value: string; sub: string; values: number[]; color: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-card border bg-bg-card/60 p-4", warn ? "border-warning/40" : "border-border-subtle")}>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <Icon size={13} /> {title}
        </span>
        {warn && <TriangleAlert size={13} className="text-warning" />}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-text">{value}</p>
      <p className="text-[11px] text-text-faint">{sub}</p>
      <AreaChart values={values} color={color} label={`${title}: ${value}`} />
    </div>
  );
}

const uptime = (iso: string, now: number) => {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${s % 60}s` : `${s}s`;
};

type SortKey = "cpu" | "memory" | "uptime" | "name";

/**
 * Monitor: CPU/RAM do PC, do Qyrex e dos processos do runner, com histórico curto.
 * Só lê enquanto está na tela; o intervalo é escolhido pelo usuário (ou pausado).
 */
export function MonitorView({ visible }: { visible: boolean }) {
  const { processes, stop, select } = useRunnerStore();
  const projects = useProjectsStore((s) => s.projects);
  const [interval, setIntervalMs] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(INTERVAL_KEY);
      const v = raw === null ? NaN : Number(raw);
      return (INTERVALS as readonly number[]).includes(v) ? v : 2000;
    } catch {
      return 2000;
    }
  });
  const [samples, setSamples] = useState<MonitorSample[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "cpu", desc: true });
  const [filter, setFilter] = useState("");
  const procHistory = useRef(new Map<string, number[]>());

  useEffect(() => {
    try {
      localStorage.setItem(INTERVAL_KEY, String(interval));
    } catch {
      // sem storage
    }
    if (!visible || interval === 0) return;
    let alive = true;
    const read = async () => {
      const s = await attempt(window.workspace.runner.monitor());
      if (!alive || !s) return;
      for (const p of s.processes) procHistory.current.set(p.runnerId, [...(procHistory.current.get(p.runnerId) ?? []), p.cpu].slice(-HISTORY));
      setSamples((list) => [...list, s].slice(-HISTORY));
    };
    void read();
    const t = window.setInterval(() => document.visibilityState === "visible" && void read(), interval);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [visible, interval]);

  const last = samples[samples.length - 1];
  const memPct = last ? (last.memUsed / last.memTotal) * 100 : 0;
  // Alerta só com uso alto sustentado (3 leituras), para não piscar à toa.
  const recent = samples.slice(-3);
  const cpuHigh = recent.length === 3 && recent.every((s) => s.cpu >= 90);
  const memHigh = memPct >= 90;
  const heavy = last?.processes.filter((p) => p.memory > 1.5e9) ?? [];
  const now = last ? Date.parse(last.at) : Date.now();

  const rows = useMemo(() => {
    const running = processes.filter((p) => p.status === "running");
    const q = filter.trim().toLowerCase();
    const list = running
      .map((p) => ({ proc: p, usage: last?.processes.find((u) => u.runnerId === p.id) }))
      .filter(({ proc }) => !q || `${proc.projectName} ${proc.command}`.toLowerCase().includes(q));
    const val = (r: (typeof list)[number]) =>
      sort.key === "cpu" ? r.usage?.cpu ?? 0 : sort.key === "memory" ? r.usage?.memory ?? 0 : sort.key === "uptime" ? now - Date.parse(r.proc.startedAt) : 0;
    return list.sort((a, b) =>
      sort.key === "name" ? a.proc.projectName.localeCompare(b.proc.projectName) * (sort.desc ? -1 : 1) : (val(a) - val(b)) * (sort.desc ? -1 : 1)
    );
  }, [processes, last, sort, filter, now]);

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={cn("py-2 pr-3 font-medium", className)}>
      <button className="inline-flex items-center gap-1 hover:text-text" onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : true })}>
        {label}
        {sort.key === key && <ArrowDownUp size={10} />}
      </button>
    </th>
  );

  async function confirmStop(id: string, label: string) {
    const ok = await confirmAction({ title: tr("Encerrar {name}?", { name: label }), description: tr("Encerra o processo e todos os que ele abriu."), danger: true, confirmLabel: tr("Encerrar") });
    if (ok) await stop(id);
  }

  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">{tr("Consumo do Qyrex em tempo real, com o total do PC como referência.")}</p>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          {tr("Atualizar a cada")}
          <select className="input w-auto py-1 pr-7 text-xs" value={interval} onChange={(e) => setIntervalMs(Number(e.target.value))}>
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i === 0 ? tr("Pausado") : tr("{n} s", { n: i / 1000 })}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(cpuHigh || memHigh || heavy.length > 0) && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          <TriangleAlert size={14} className="mt-px shrink-0" />
          <span>
            {cpuHigh && tr("CPU acima de 90% há algumas leituras. ")}
            {memHigh && tr("Memória do PC acima de 90%. ")}
            {heavy.length > 0 && trn(heavy.length, "{n} processo usando mais de 1,5 GB.", "{n} processos usando mais de 1,5 GB.")}
          </span>
        </div>
      )}

      {/* Colunas pelo espaço disponível (a mesma tela aparece num painel estreito do Workspace). */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <Stat
          icon={Cpu}
          title={tr("CPU do Qyrex")}
          value={last ? `${last.app.cpu.toFixed(1)}%` : "—"}
          sub={last ? tr("{mem} de memória", { mem: formatBytes(last.app.memory) }) : tr("Lendo...")}
          values={samples.map((s) => s.app.cpu)}
          color="--warning"
        />
        <Stat
          icon={MemoryStick}
          title={tr("Memória do Qyrex")}
          value={last ? formatBytes(last.app.memory) : "—"}
          sub={tr("Todos os processos do aplicativo")}
          values={samples.map((s) => (s.app.memory / s.memTotal) * 100)}
          color="--accent"
        />
        <Stat
          icon={Cpu}
          title={tr("CPU do PC")}
          value={last ? `${Math.round(last.cpu)}%` : "—"}
          sub={last ? trn(last.cores, "{n} núcleo", "{n} núcleos") : tr("Lendo...")}
          values={samples.map((s) => s.cpu)}
          color="--accent"
          warn={cpuHigh}
        />
        <Stat
          icon={MemoryStick}
          title={tr("Memória do PC")}
          value={last ? `${Math.round(memPct)}%` : "—"}
          sub={last ? `${formatBytes(last.memUsed)} / ${formatBytes(last.memTotal)}` : tr("Lendo...")}
          values={samples.map((s) => (s.memUsed / s.memTotal) * 100)}
          color="--success"
          warn={memHigh}
        />

      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <p className="section-title">{trn(rows.length, "{n} processo rodando", "{n} processos rodando")}</p>
        <input className="input w-56 py-1 text-xs" placeholder={tr("Filtrar...")} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {rows.length === 0 ? (
        <EmptyState mascot title={tr("Nada rodando")} description={tr("Os servidores e scripts que você rodar pelo Qyrex aparecem aqui com o consumo de cada um.")} className="py-6" />
      ) : (
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-faint">
              {header("name", tr("Processo"))}
              <th className="py-2 pr-3 font-medium">PID</th>
              {header("cpu", "CPU")}
              {header("memory", tr("Memória"))}
              {header("uptime", tr("Rodando há"))}
              <th className="py-2 pr-3 font-medium">{tr("Portas")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ proc, usage }) => {
              const project = projects.find((p) => p.id === proc.projectId);
              const history = procHistory.current.get(proc.id) ?? [];
              return (
                <tr key={proc.id} className="border-b border-border-subtle/60 hover:bg-bg-hover/40">
                  <td className="py-2 pr-3">
                    <button className="flex items-center gap-2 text-left" onClick={() => select(proc.id)} title={tr("Ver a saída")}>
                      <ProjectIcon name={proc.projectName} icon={project?.icon} size={20} className="rounded-md" />
                      <span>
                        <span className="block text-text">{proc.projectName}</span>
                        <span className="block font-mono text-[11px] text-text-faint">{proc.script ?? proc.command}</span>
                      </span>
                    </button>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-text-faint">
                    {proc.pid}
                    {usage && usage.processCount > 1 && <span className="ml-1 text-text-faint">(+{usage.processCount - 1})</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span className="w-12 font-mono text-xs tabular-nums text-text">{usage ? `${usage.cpu.toFixed(1)}%` : "—"}</span>
                      <span className="w-20">
                        <AreaChart values={history} color="--accent" label="CPU" />
                      </span>
                    </span>
                  </td>
                  <td className={cn("py-2 pr-3 font-mono text-xs tabular-nums", usage && usage.memory > 1.5e9 ? "text-warning" : "text-text")}>
                    {usage ? formatBytes(usage.memory) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-text-muted">{uptime(proc.startedAt, now)}</td>
                  <td className="py-2 pr-3">
                    {proc.urls.length === 0 ? (
                      <span className="text-xs text-text-faint">—</span>
                    ) : (
                      proc.urls.map((u) => (
                        <button key={u} onClick={() => void attempt(window.workspace.system.openExternalUrl(u))} className="mr-1">
                          <Badge tone="accent">
                            {u.replace(/^https?:\/\/[^:/]+:?/, ":").replace(/\/$/, "")} <ExternalLink size={9} />
                          </Badge>
                        </button>
                      ))
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Button size="xs" variant="ghost" className="text-danger" onClick={() => void confirmStop(proc.id, proc.script ?? proc.command)}>
                      <Square size={10} /> {tr("Encerrar")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
