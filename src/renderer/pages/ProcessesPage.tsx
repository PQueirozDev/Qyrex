import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Play, Plug, RefreshCw, RotateCcw, Square, Terminal as TerminalIcon, Trash2, X } from "lucide-react";
import type { ListeningPort, ProjectScripts, RunnerProcess } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, ProjectIcon, Segmented, Spinner } from "@/components/ui/primitives";
import { RunnerOutput } from "@/components/runner/RunnerOutput";
import { MonitorView } from "@/components/runner/MonitorView";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { tr, trn } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { runningCount, useRunnerStore } from "@/stores/useRunnerStore";
import { confirmAction, useUIStore } from "@/stores/useUIStore";

const STATUS_DOT: Record<RunnerProcess["status"], string> = {
  running: "bg-success",
  exited: "bg-text-faint",
  stopped: "bg-text-faint",
  failed: "bg-danger",
};

const openUrl = (url: string) => void attempt(window.workspace.system.openExternalUrl(url));

/** Lançador: escolhe o projeto e roda um script do package.json ou um comando livre. */
function Launcher({ onClose }: { onClose: () => void }) {
  const { projects, load, loaded } = useProjectsStore();
  const pageParam = useUIStore((s) => s.pageParam);
  const { runScript, runCommand, processes } = useRunnerStore();
  const active = useMemo(
    () => projects.filter((p) => !p.archivedAt).sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "")),
    [projects]
  );
  const [projectId, setProjectId] = useState<string>("");
  const [scripts, setScripts] = useState<ProjectScripts | null>(null);
  const [command, setCommand] = useState("");

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  useEffect(() => {
    if (projectId || active.length === 0) return;
    setProjectId(active.find((p) => p.id === pageParam)?.id ?? active[0].id);
  }, [active, projectId, pageParam]);
  useEffect(() => {
    if (!projectId) return;
    setScripts(null);
    void attempt(window.workspace.runner.scripts(projectId)).then((s) => setScripts(s ?? { packageManager: "npm", scripts: [] }));
  }, [projectId]);

  const isRunning = (script: string) => processes.some((p) => p.projectId === projectId && p.script === script && p.status === "running");

  async function run(name: string, cmd: string) {
    if (!scripts) return;
    if (await runScript(projectId, name, cmd, scripts.packageManager)) onClose();
  }
  async function runFree() {
    if (!command.trim()) return;
    if (await runCommand(projectId, command.trim())) onClose();
  }

  if (active.length === 0) {
    return <p className="p-4 text-sm text-text-faint">{tr("Adicione um projeto para rodar scripts dele aqui.")}</p>;
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <select className="input flex-1" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label={tr("Projeto")}>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label={tr("Fechar")}>
          <X size={14} />
        </Button>
      </div>
      <div>
        <p className="section-title mb-1.5">{tr("Scripts do package.json")}</p>
        {scripts === null ? (
          <Spinner />
        ) : scripts.scripts.length === 0 ? (
          <p className="text-xs text-text-faint">{tr("Nenhum script encontrado neste projeto.")}</p>
        ) : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {scripts.scripts.map((s) => (
              <li key={s.name}>
                <button
                  onClick={() => void run(s.name, s.command)}
                  disabled={isRunning(s.name)}
                  className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-hover disabled:opacity-50"
                >
                  <Play size={12} className="shrink-0 text-accent" />
                  <span className="w-28 shrink-0 truncate font-mono text-[12px] text-text">{s.name}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-faint">{s.command}</span>
                  {isRunning(s.name) && <Badge tone="success">{tr("Rodando")}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runFree();
        }}
      >
        <input
          className="input flex-1 font-mono text-xs"
          placeholder={tr("Ou um comando: python manage.py runserver")}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!command.trim()}>
          <Play size={12} /> {tr("Rodar")}
        </Button>
      </form>
    </div>
  );
}

function PortsView() {
  const [ports, setPorts] = useState<ListeningPort[] | null>(null);
  const [loading, setLoading] = useState(false);
  const select = useRunnerStore((s) => s.select);

  const load = useCallback(async () => {
    setLoading(true);
    setPorts((await attempt(window.workspace.runner.ports())) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function kill(port: ListeningPort) {
    const ok = await confirmAction({
      title: tr("Liberar a porta {port}?", { port: port.port }),
      description: tr("Encerra o processo que está usando a porta (e os filhos dele). Trabalho não salvo nele será perdido."),
      detail: `${port.processName ?? "?"} (PID ${port.pid})`,
      danger: true,
      confirmLabel: tr("Encerrar processo"),
    });
    if (!ok) return;
    if ((await attempt(window.workspace.runner.killPort(port.port, port.pid, true), tr("Porta liberada"))) !== undefined) void load();
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-text-muted">{tr("Portas TCP em uso por aplicativos neste PC.")}</p>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          {loading ? <Spinner /> : <RefreshCw size={13} />} {tr("Atualizar")}
        </Button>
      </div>
      {ports === null ? (
        <Spinner />
      ) : ports.length === 0 ? (
        <EmptyState icon={Plug} title={tr("Nenhuma porta em uso")} description={tr("Quando um servidor subir, ele aparece aqui.")} />
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-faint">
              <th className="py-2 pr-4 font-medium">{tr("Porta")}</th>
              <th className="py-2 pr-4 font-medium">{tr("Processo")}</th>
              <th className="py-2 pr-4 font-medium">PID</th>
              <th className="py-2 pr-4 font-medium">{tr("Endereço")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ports.map((p) => (
              <tr key={`${p.port}-${p.pid}`} className="group border-b border-border-subtle/60 hover:bg-bg-hover/50">
                <td className="py-2 pr-4 font-mono font-semibold text-text">{p.port}</td>
                <td className="py-2 pr-4 text-text-muted">
                  {p.processName ?? "?"}
                  {p.runnerId && (
                    <button className="ml-2" onClick={() => select(p.runnerId)}>
                      <Badge tone="accent">{tr("Runner")}</Badge>
                    </button>
                  )}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-text-faint">{p.pid}</td>
                <td className="py-2 pr-4 font-mono text-xs text-text-faint">{p.address}</td>
                <td className="py-2 text-right">
                  <span className="inline-flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => openUrl(`http://localhost:${p.port}/`)} title={tr("Abrir no navegador")}>
                      <ExternalLink size={12} />
                    </Button>
                    <Button size="xs" variant="ghost" className="text-danger" onClick={() => void kill(p)}>
                      {tr("Encerrar")}
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProcessRow({ proc, selected, onSelect }: { proc: RunnerProcess; selected: boolean; onSelect: () => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const project = projects.find((p) => p.id === proc.projectId);
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
        selected ? "bg-bg-hover" : "hover:bg-bg-hover/60"
      )}
    >
      <ProjectIcon name={proc.projectName} icon={project?.icon} size={22} className="mt-0.5 rounded-md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[proc.status])} />
          <span className="truncate font-mono text-[12px] text-text">{proc.script ?? proc.command}</span>
        </span>
        <span className="block truncate text-[11px] text-text-faint">
          {proc.projectName} · {proc.status === "running" ? timeAgo(proc.startedAt) : proc.status === "failed" ? tr("falhou") : tr("parado")}
        </span>
        {proc.urls[0] && proc.status === "running" && <span className="mt-0.5 block truncate font-mono text-[10.5px] text-accent">{proc.urls[0]}</span>}
      </span>
    </button>
  );
}

export function ProcessesPage() {
  const { processes, init, selectedId, select, stop, restart, remove } = useRunnerStore();
  const { load, loaded } = useProjectsStore();
  const [view, setView] = useState<"processos" | "portas" | "monitor">("monitor");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const previousSelection = useRef(selectedId);
  const Icon = PAGE_ICONS.processos;

  useEffect(() => {
    init();
    if (!loaded) void load();
  }, [init, load, loaded]);

  const selected = processes.find((p) => p.id === selectedId) ?? processes[0] ?? null;
  const running = runningCount(processes);

  // Selecionar no painel de portas leva de volta à saída do processo.
  useEffect(() => {
    if (selectedId && selectedId !== previousSelection.current) setView("processos");
    previousSelection.current = selectedId;
  }, [selectedId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
            <Icon size={17} />
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-text">{tr("Processos")}</h1>
            <p className="text-xs text-text-muted">
              {running > 0 ? trn(running, "{n} processo rodando", "{n} processos rodando") : tr("Servidores de dev, watchers e scripts dos seus projetos.")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "processos", label: tr("Processos") },
              { value: "monitor", label: tr("Monitor") },
              { value: "portas", label: tr("Portas") },
            ]}
          />
          <Button size="sm" onClick={() => setLauncherOpen((o) => !o)}>
            <Play size={13} /> {tr("Rodar")}
          </Button>
        </div>
      </div>

      {launcherOpen && (
        <div className="border-b border-border-subtle bg-bg-elevated/60">
          <div className="mx-auto max-w-2xl">
            <Launcher onClose={() => setLauncherOpen(false)} />
          </div>
        </div>
      )}

      {view === "monitor" ? (
        <div className="min-h-0 flex-1">
          <MonitorView visible />
        </div>
      ) : view === "portas" ? (
        <div className="min-h-0 flex-1">
          <PortsView />
        </div>
      ) : processes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            mascot
            title={tr("Nada rodando")}
            description={tr("Suba o servidor de dev, os testes em modo watch ou qualquer script do package.json. A saída fica aqui, e tudo é encerrado ao fechar o Qyrex.")}
            action={
              <Button size="sm" onClick={() => setLauncherOpen(true)}>
                <Play size={13} /> {tr("Rodar um script")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-64 shrink-0 space-y-0.5 overflow-y-auto border-r border-border-subtle p-2">
            {processes.map((p) => (
              <ProcessRow key={p.id} proc={p} selected={p.id === selected?.id} onSelect={() => select(p.id)} />
            ))}
          </aside>
          {selected && (
            <section className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2">
                <TerminalIcon size={13} className="text-text-faint" />
                <span className="min-w-0 truncate font-mono text-xs text-text" title={selected.command}>
                  {selected.command}
                </span>
                {selected.status !== "running" && selected.exitCode !== null && (
                  <Badge tone={selected.status === "failed" ? "danger" : "neutral"}>{tr("código {code}", { code: selected.exitCode })}</Badge>
                )}
                <span className="ml-auto flex items-center gap-1">
                  {selected.urls.map((u) => (
                    <Button key={u} size="xs" variant="secondary" onClick={() => openUrl(u)} title={tr("Abrir no navegador")}>
                      <ExternalLink size={11} /> {u.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </Button>
                  ))}
                  <Button size="xs" variant="ghost" onClick={() => void restart(selected.id)} title={tr("Reiniciar")}>
                    <RotateCcw size={12} /> {tr("Reiniciar")}
                  </Button>
                  {selected.status === "running" ? (
                    <Button size="xs" variant="ghost" className="text-danger" onClick={() => void stop(selected.id)}>
                      <Square size={11} /> {tr("Encerrar")}
                    </Button>
                  ) : (
                    <Button size="xs" variant="ghost" onClick={() => void remove(selected.id)} title={tr("Remover da lista")} aria-label={tr("Remover da lista")}>
                      <Trash2 size={12} />
                    </Button>
                  )}
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <RunnerOutput key={selected.id + selected.startedAt} processId={selected.id} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
