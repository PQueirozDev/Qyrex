import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { MessageSquareText, CheckCircle2, Code2, FileCode2, FileText, FolderOpen, GitBranch, GitCommitHorizontal, Plus, Settings2, SquareTerminal, Timer } from "lucide-react";
import type { CalendarEvent, DashboardWidgetId, GitCommit, ProjectWithGit, RecentItem } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, LoadingRows, ProjectIcon } from "@/components/ui/primitives";
import { DitherGlow } from "@/components/ui/Brand";
import { useTasksStore } from "@/stores/useTasksStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUIStore } from "@/stores/useUIStore";
import { attempt } from "@/lib/api";
import { addDays, toLocalDateTime, formatTime, greeting, shortDay, timeAgo, todayISO, toLocalDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PRIORITY_LABEL } from "@/components/TaskFormDialog";
import { getLocale, tr, trn } from "@/lib/i18n";
import { AppUsageButton } from "@/components/AppUsage";
import { FocusCardBody } from "@/components/Focus";
import { DashboardCustomizeDialog, dashboardOrder } from "@/components/DashboardCustomize";
import { useFocusStore } from "@/stores/useFocusStore";
import { RUN_STATUS } from "@/components/AutomationRun";
import { NoticesWidget, ServersWidget } from "@/components/DashboardExtras";
import type { AutomationRun } from "@shared/types";

/**
 * Bloco do Início. De propósito mais leve que o `Card` das outras páginas:
 * sem sombra e sem ícone no título, para a tela respirar.
 */
function Widget({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-card border border-border-subtle bg-bg-card/60 px-4 pb-4 pt-3">
      <header className="mb-2 flex min-h-7 items-center justify-between gap-2">
        <h2 className="text-[13px] font-medium text-text-muted">{title}</h2>
        {action}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function WidgetLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-[11px] text-text-faint transition-colors hover:text-text">
      {children}
    </button>
  );
}

/** Últimas execuções de automações (dados reais do histórico). */
function AutomationRunsList() {
  const navigate = useUIStore((s) => s.navigate);
  const [runs, setRuns] = useState<(AutomationRun & { automationName: string; projectId: string })[] | null>(null);
  useEffect(() => {
    const load = () => void attempt(window.workspace.automations.recentRuns()).then((r) => setRuns(r ?? []));
    load();
    return window.workspace.automations.onProgress((r) => r.status !== "running" && load());
  }, []);
  if (runs === null) return <LoadingRows rows={2} />;
  if (runs.length === 0) {
    return (
      <p className="py-2 text-sm text-text-faint">
        {tr("Nenhuma automação executada ainda.")}{" "}
        <button className="text-accent hover:underline" onClick={() => navigate("automacoes")}>
          {tr("Criar uma")}
        </button>
      </p>
    );
  }
  return (
    <ul className="-mx-1 space-y-0.5">
      {runs.map((r) => (
        <li key={r.id}>
          <button onClick={() => navigate("automacoes", r.projectId)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-bg-hover">
            <span className="min-w-0 flex-1 truncate text-sm text-text">{r.automationName}</span>
            <span className="shrink-0 text-[11px] text-text-faint">{timeAgo(r.startedAt)}</span>
            <Badge tone={RUN_STATUS[r.status].tone}>{tr(RUN_STATUS[r.status].label)}</Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Faixa "continuar de onde parou": o último projeto aberto, a um clique. */
function ContinueStrip({ project, lastCommit }: { project: ProjectWithGit; lastCommit: GitCommit | null }) {
  const navigate = useUIStore((s) => s.navigate);
  const open = useProjectsStore((s) => s.open);
  const git = project.git;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-border-subtle bg-bg-card/60 px-4 py-3">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate("projetos", project.id)}>
        <ProjectIcon name={project.name} icon={project.icon} size={34} />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[11px] text-text-faint">{tr("Continuar de onde parou")}</span>
          <span className="block truncate text-sm font-semibold text-text">{project.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-text-faint">
            {git?.isRepo && (
              <>
                <GitBranch size={11} />
                <span className="font-mono">{git.branch ?? "?"}</span>
                {git.modifiedCount > 0 && <span className="text-warning">· {trn(git.modifiedCount, "{n} alteração", "{n} alterações")}</span>}
              </>
            )}
            {lastCommit && <span className="truncate">· {lastCommit.subject}</span>}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 gap-1.5">
        <Button size="sm" onClick={() => void open(project, "vscode")}>
          <Code2 size={13} /> {tr("VS Code")}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => navigate("terminal", project.id)} title={tr("Terminal")} aria-label={tr("Terminal")}>
          <SquareTerminal size={15} />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => navigate("editor", project.localPath)} title={tr("Editar no Qyrex")} aria-label={tr("Editar no Qyrex")}>
          <FileCode2 size={15} />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => void open(project, "explorer")} title={tr("Explorer")} aria-label={tr("Explorer")}>
          <FolderOpen size={15} />
        </Button>
      </div>
    </div>
  );
}

// Só carrega o Markdown quando o diálogo da daily abre.
const DailyDialog = lazy(() => import("@/components/DailyDialog"));

/** Widgets que ocupam duas colunas na tela larga. */
const WIDE_WIDGETS = new Set<DashboardWidgetId>(["projetos"]);
const ACTIVITY_ICON: Record<string, typeof Code2> = {
  project: Code2,
  file: FileText,
  task_completed: CheckCircle2,
  commit: GitCommitHorizontal,
  focus: Timer,
  automation: Settings2,
};

const ACTIVITY_TEXT: Record<string, string> = {
  project: tr("Projeto aberto"),
  file: tr("Arquivo aberto"),
  task_completed: tr("Tarefa concluída"),
  commit: tr("Commit"),
  focus: tr("Sessão de foco"),
  automation: tr("Automação executada"),
};

export function Dashboard() {
  const navigate = useUIStore((s) => s.navigate);
  const setQuickTaskOpen = useUIStore((s) => s.setQuickTaskOpen);
  const { tasks, loaded: tasksLoaded, load: loadTasks, toggleDone } = useTasksStore();
  const { projects: allProjects, loaded: projectsLoaded, load: loadProjects, open: openProject } = useProjectsStore();
  const projects = useMemo(() => allProjects.filter((p) => !p.archivedAt), [allProjects]);
  const settings = useSettingsStore((s) => s.settings);
  const setFocusDialog = useFocusStore((s) => s.setDialog);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [activity, setActivity] = useState<RecentItem[]>([]);
  const [commits, setCommits] = useState<(GitCommit & { project: string; projectId: string })[]>([]);

  const today = todayISO();

  useEffect(() => {
    void loadTasks();
    void loadProjects();
    void attempt(window.workspace.calendar.list({ from: `${today}T00:00:00`, to: `${toLocalDate(addDays(new Date(), 2))}T23:59:59` })).then(
      (data) => setEvents(data ?? [])
    );
    void attempt(window.workspace.activity.list(12)).then((data) => setActivity(data ?? []));
  }, [loadTasks, loadProjects, today]);

  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt))
        .slice(0, 5),
    [projects]
  );
  // "Continuar": o último aberto de verdade (favorito não fura a fila aqui).
  const lastProject = useMemo(
    () => [...projects].filter((p) => p.lastOpenedAt).sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0] ?? null,
    [projects]
  );

  // Commits recentes dos projetos mais usados (git local, sem rede).
  useEffect(() => {
    const repos = recentProjects.filter((p) => p.git?.isRepo).slice(0, 3);
    if (repos.length === 0) return;
    void Promise.all(
      repos.map(async (p) =>
        ((await attempt(window.workspace.git.commits(p.localPath, 4))) ?? []).map((c) => ({ ...c, project: p.name, projectId: p.id }))
      )
    ).then((lists) => setCommits(lists.flat().sort((a, b) => b.date.localeCompare(a.date))));
  }, [recentProjects]);
  const lastCommit = lastProject ? commits.find((c) => c.projectId === lastProject.id) ?? null : null;

  const focusTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.status !== "concluido" && (!t.dueDate || t.dueDate <= today))
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
        .slice(0, 7),
    [tasks, today]
  );
  const doneToday = tasks.filter((t) => t.status === "concluido" && t.completedAt && toLocalDate(new Date(t.completedAt)) === today);
  const todayEvents = (events ?? []).filter((e) => e.startsAt.slice(0, 10) === today);
  const nextEvents = (events ?? []).filter((e) => e.startsAt.slice(0, 10) > today).slice(0, 3);
  const overdue = tasks.filter((t) => t.status !== "concluido" && t.dueDate && t.dueDate < today).length;
  const nowTime = toLocalDateTime(new Date());
  const nextToday = todayEvents.find((e) => e.startsAt >= nowTime);

  const widgets: Record<DashboardWidgetId, ReactNode> = {
    agenda: (
      <Widget title={tr("Agenda de hoje")} action={<WidgetLink onClick={() => navigate("agenda")}>{tr("Abrir")}</WidgetLink>}>
        {events === null ? (
          <LoadingRows rows={2} />
        ) : todayEvents.length === 0 ? (
          <p className="py-2 text-sm text-text-faint">{tr("Nenhum compromisso hoje.")}</p>
        ) : (
          // Linha do tempo: o que já passou fica apagado e o próximo compromisso pulsa.
          <ul className="relative">
            <span aria-hidden className="absolute bottom-4 left-[64.5px] top-4 w-px bg-border-subtle" />
            {todayEvents.map((e) => {
              const past = (e.endsAt ?? e.startsAt) < nowTime;
              const isNext = e.id === nextToday?.id;
              return (
                <li key={e.id} className={cn("relative flex items-center gap-3 rounded-md px-1 py-1.5", past && "opacity-45")}>
                  <span className={cn("w-11 font-mono text-xs tabular-nums", isNext ? "text-accent" : "text-text-muted")}>{formatTime(e.startsAt)}</span>
                  <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    {isNext && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/50" />}
                    <span className={cn("relative h-2 w-2 rounded-full ring-[3px] ring-bg-card", isNext ? "bg-accent" : past ? "bg-text-faint" : "bg-border")} />
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-sm text-text", isNext && "font-medium")}>{e.title}</span>
                  {e.source === "google" && <span className="text-[10px] text-text-faint">{tr("Google")}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {nextEvents.length > 0 && (
          <div className="mt-2 border-t border-border-subtle pt-2">
            {nextEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-1 py-1 text-xs text-text-muted">
                <span className="w-14 shrink-0 text-text-faint first-letter:uppercase">{shortDay(e.startsAt)}</span>
                <span className="truncate">
                  {formatTime(e.startsAt)} · {e.title}
                </span>
              </div>
            ))}
          </div>
        )}
      </Widget>
    ),
    tarefas: (
      <Widget
        title={tr("Tarefas")}
        action={
          <div className="flex items-center gap-3">
            {doneToday.length > 0 && <span className="text-[11px] text-success">{trn(doneToday.length, "{n} feita hoje", "{n} feitas hoje")}</span>}
            <WidgetLink onClick={() => navigate("tarefas")}>{tr("Ver todas")}</WidgetLink>
          </div>
        }
      >
        {!tasksLoaded ? (
          <LoadingRows rows={3} />
        ) : focusTasks.length === 0 ? (
          <EmptyState
            mascot
            title={tr("Nada pendente para hoje")}
            className="py-3"
            action={
              <Button size="xs" variant="secondary" onClick={() => setQuickTaskOpen(true)}>
                <Plus size={12} /> {tr("Nova tarefa")}
              </Button>
            }
          />
        ) : (
          <ul className="-mx-1 space-y-0.5">
            {focusTasks.map((task) => (
              <li key={task.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-bg-hover">
                <input
                  type="checkbox"
                  checked={task.status === "concluido"}
                  onChange={() => void toggleDone(task)}
                  aria-label={tr("Concluir {name}", { name: task.title })}
                />
                <button className="min-w-0 flex-1 truncate text-left text-sm text-text" onClick={() => navigate("tarefas", task.id)}>
                  {task.title}
                </button>
                {task.dueDate && task.dueDate < today ? (
                  <Badge tone="danger">{tr("Atrasada")}</Badge>
                ) : (
                  (task.priority === "urgente" || task.priority === "alta") && (
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", task.priority === "urgente" ? "bg-danger" : "bg-warning")} title={PRIORITY_LABEL[task.priority]} />
                  )
                )}
                {task.dueTime && <span className="font-mono text-[11px] text-text-faint">{task.dueTime}</span>}
              </li>
            ))}
          </ul>
        )}
      </Widget>
    ),
    atividade: (
      <Widget title={tr("Atividade")}>
        {activity.length === 0 && commits.length === 0 ? (
          <p className="py-2 text-sm text-text-faint">{tr("Sua atividade recente aparece aqui.")}</p>
        ) : (
          <ul className="space-y-1">
            {commits.slice(0, 3).map((c) => (
              <li key={c.hash} className="flex items-start gap-2.5 py-1">
                <GitCommitHorizontal size={14} className="mt-0.5 shrink-0 text-text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-text">{c.subject}</p>
                  <p className="text-[11px] text-text-faint">
                    {c.project} · {c.shortHash} · {timeAgo(c.date)}
                  </p>
                </div>
              </li>
            ))}
            {activity.slice(0, 4).map((a) => {
              const Icon = ACTIVITY_ICON[a.itemType] ?? FileText;
              return (
                <li key={a.id} className="flex items-start gap-2.5 py-1">
                  <Icon size={14} className={cn("mt-0.5 shrink-0", a.itemType === "task_completed" ? "text-success" : "text-text-faint")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-text">{a.label}</p>
                    <p className="text-[11px] text-text-faint">
                      {ACTIVITY_TEXT[a.itemType]} · {timeAgo(a.openedAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Widget>
    ),
    foco: (
      <Widget title={tr("Foco")} action={<WidgetLink onClick={() => setFocusDialog("history")}>{tr("Histórico")}</WidgetLink>}>
        <FocusCardBody />
      </Widget>
    ),
    automacoes: (
      <Widget title={tr("Automações")} action={<WidgetLink onClick={() => navigate("automacoes")}>{tr("Abrir")}</WidgetLink>}>
        <AutomationRunsList />
      </Widget>
    ),
    servidores: (
      <Widget title={tr("Servidores ativos")} action={<WidgetLink onClick={() => navigate("processos", "monitor")}>{tr("Monitor")}</WidgetLink>}>
        <ServersWidget />
      </Widget>
    ),
    avisos: (
      <Widget title={tr("Avisos importantes")}>
        <NoticesWidget />
      </Widget>
    ),
    projetos: (
      <Widget title={tr("Projetos recentes")} action={<WidgetLink onClick={() => navigate("projetos")}>{tr("Todos os projetos")}</WidgetLink>}>
        {!projectsLoaded ? (
          <LoadingRows rows={2} />
        ) : recentProjects.length === 0 ? (
          <EmptyState
            mascot
            title={tr("Nenhum projeto ainda")}
            description={tr("Adicione a pasta de um projeto para abrir no VS Code, terminal e GitHub com um clique.")}
            className="py-4"
            action={
              <Button size="sm" onClick={() => navigate("projetos", "new")}>
                <Plus size={13} /> {tr("Adicionar projeto")}
              </Button>
            }
          />
        ) : (
          // Lista compacta: nome, branch e alterações; as ações aparecem só no hover.
          <ul className="-mx-1">
            {recentProjects.map((project) => (
              <li key={project.id} className="group flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-bg-hover">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate("projetos", project.id)}>
                  <ProjectIcon name={project.name} icon={project.icon} size={24} className="rounded-md" />
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{project.name}</span>
                  {project.git?.isRepo && (
                    <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-text-faint sm:flex">
                      <span className="font-mono">{project.git.branch}</span>
                      {project.git.modifiedCount > 0 && (
                        <span className="text-warning" title={trn(project.git.modifiedCount, "{n} alteração", "{n} alterações")}>
                          ●{project.git.modifiedCount}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="w-20 shrink-0 text-right text-[11px] text-text-faint group-hover:hidden">
                    {project.lastOpenedAt ? timeAgo(project.lastOpenedAt) : "—"}
                  </span>
                </button>
                <span className="hidden w-20 shrink-0 justify-end gap-0.5 group-hover:flex">
                  <Button size="icon-sm" variant="ghost" onClick={() => void openProject(project, "vscode")} title={tr("Abrir no VS Code")} aria-label={tr("Abrir no VS Code")}>
                    <Code2 size={12} />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => navigate("terminal", project.id)} title={tr("Terminal")} aria-label={tr("Terminal")}>
                    <SquareTerminal size={12} />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => void openProject(project, "explorer")} title={tr("Pasta")} aria-label={tr("Pasta")}>
                    <FolderOpen size={12} />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Widget>
    ),
  };
  const visibleWidgets = dashboardOrder(settings?.dashboard).filter((id) => !settings?.dashboard.hidden.includes(id));

  // Resumo do dia numa linha só (substitui os cards de número).
  const summary: { text: string; tone?: "danger"; onClick: () => void }[] = [
    { text: trn(focusTasks.length, "{n} tarefa em foco", "{n} tarefas em foco"), onClick: () => navigate("tarefas") },
    ...(overdue > 0 ? [{ text: trn(overdue, "{n} atrasada", "{n} atrasadas"), tone: "danger" as const, onClick: () => navigate("tarefas") }] : []),
    {
      text: nextToday
        ? tr("Próximo compromisso às {time}", { time: formatTime(nextToday.startsAt) })
        : trn(todayEvents.length, "{n} compromisso hoje", "{n} compromissos hoje"),
      onClick: () => navigate("agenda"),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="relative flex flex-wrap items-end justify-between gap-3 pt-2">
        <DitherGlow className="absolute -right-7 -top-6 h-[150px] w-[70%] opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-text">
            {greeting()}
            {settings?.userName && `, ${settings.userName}`}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
            <span className="first-letter:uppercase">{new Date().toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "long" })}</span>
            {summary.map((s) => (
              <span key={s.text} className="flex items-center gap-2">
                <span className="text-text-faint">·</span>
                <button onClick={s.onClick} className={cn("transition-colors hover:text-text", s.tone === "danger" && "text-danger")}>
                  {s.text}
                </button>
              </span>
            ))}
          </p>
        </div>
        <div className="relative flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDailyOpen(true)} title={tr("Resumo para a daily")}>
            <MessageSquareText size={14} /> {tr("Daily")}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setCustomizeOpen(true)} title={tr("Personalizar o Início")} aria-label={tr("Personalizar o Início")}>
            <Settings2 size={15} />
          </Button>
          <AppUsageButton />
        </div>
      </div>
      <DashboardCustomizeDialog open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      {dailyOpen && (
        <Suspense fallback={null}>
          <DailyDialog open={dailyOpen} onClose={() => setDailyOpen(false)} />
        </Suspense>
      )}

      {lastProject && <ContinueStrip project={lastProject} lastCommit={lastCommit} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-flow-row-dense xl:grid-cols-3">
        {visibleWidgets.map((id) => (
          <div key={id} className={cn("min-w-0", WIDE_WIDGETS.has(id) && "xl:col-span-2")}>
            {widgets[id]}
          </div>
        ))}
      </div>
    </div>
  );
}
