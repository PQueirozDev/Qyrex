import { useEffect } from "react";
import { ExternalLink, MonitorPlay, Play, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { attempt } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { tr, trn } from "@/lib/i18n";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useRunnerStore } from "@/stores/useRunnerStore";
import { useTasksStore } from "@/stores/useTasksStore";
import { useUIStore } from "@/stores/useUIStore";

/** Servidores e scripts rodando agora pelo Qyrex (dados do runner). */
export function ServersWidget() {
  const { processes, init, select } = useRunnerStore();
  const navigate = useUIStore((s) => s.navigate);
  useEffect(() => init(), [init]);
  const running = processes.filter((p) => p.status === "running");
  if (running.length === 0) {
    return (
      <div className="py-2 text-sm text-text-faint">
        {tr("Nenhum servidor rodando.")}{" "}
        <button className="text-accent hover:underline" onClick={() => navigate("processos")}>
          {tr("Rodar um script")}
        </button>
      </div>
    );
  }
  return (
    <ul className="-mx-1 space-y-0.5">
      {running.map((p) => (
        <li key={p.id} className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-bg-hover">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
          <button
            className="min-w-0 flex-1 truncate text-left text-sm text-text"
            onClick={() => {
              select(p.id);
              navigate("processos");
            }}
          >
            {p.projectName} <span className="font-mono text-xs text-text-faint">{p.script ?? p.command}</span>
          </button>
          {p.urls[0] ? (
            <>
              <Button size="icon-sm" variant="ghost" onClick={() => navigate("preview", p.projectId)} title={tr("Abrir no Preview")} aria-label={tr("Abrir no Preview")}>
                <MonitorPlay size={12} />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => void attempt(window.workspace.system.openExternalUrl(p.urls[0]))} title={p.urls[0]} aria-label={tr("Abrir no navegador")}>
                <ExternalLink size={12} />
              </Button>
            </>
          ) : (
            <Play size={11} className="text-text-faint" />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Avisos que merecem atenção, todos tirados de dados reais: tarefas atrasadas,
 * processos que falharam, projetos com conflito, operação parada ou commits para receber.
 */
export function NoticesWidget() {
  const navigate = useUIStore((s) => s.navigate);
  const tasks = useTasksStore((s) => s.tasks);
  const projects = useProjectsStore((s) => s.projects);
  const processes = useRunnerStore((s) => s.processes);
  const today = todayISO();

  const notices: { key: string; text: string; tone: "danger" | "warning"; go: () => void }[] = [];
  const late = tasks.filter((t) => t.status !== "concluido" && t.dueDate && t.dueDate < today).length;
  if (late > 0) notices.push({ key: "late", tone: "danger", text: trn(late, "{n} tarefa atrasada", "{n} tarefas atrasadas"), go: () => navigate("tarefas") });
  for (const p of processes.filter((x) => x.status === "failed").slice(0, 3)) {
    notices.push({ key: `f-${p.id}`, tone: "danger", text: tr("{name} falhou em {project}", { name: p.script ?? p.command, project: p.projectName }), go: () => navigate("processos") });
  }
  for (const p of projects.filter((x) => !x.archivedAt && x.git?.isRepo)) {
    if (p.git!.conflicts > 0) notices.push({ key: `c-${p.id}`, tone: "danger", text: trn(p.git!.conflicts, "{n} conflito em {name}", "{n} conflitos em {name}", { name: p.name }), go: () => navigate("projetos", p.id) });
    else if (p.git!.operation) notices.push({ key: `o-${p.id}`, tone: "warning", text: tr("{op} parado no meio em {name}", { op: p.git!.operation, name: p.name }), go: () => navigate("projetos", p.id) });
    else if (p.git!.behind > 0) notices.push({ key: `b-${p.id}`, tone: "warning", text: trn(p.git!.behind, "{name}: {n} commit para receber", "{name}: {n} commits para receber", { name: p.name }), go: () => navigate("projetos", p.id) });
  }

  if (notices.length === 0) return <p className="py-2 text-sm text-text-faint">{tr("Tudo em dia. Nenhum aviso.")}</p>;
  return (
    <ul className="-mx-1 space-y-0.5">
      {notices.slice(0, 6).map((n) => (
        <li key={n.key}>
          <button onClick={n.go} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-sm hover:bg-bg-hover">
            <TriangleAlert size={13} className={n.tone === "danger" ? "shrink-0 text-danger" : "shrink-0 text-warning"} />
            <span className="min-w-0 flex-1 truncate text-text">{n.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
