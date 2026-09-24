import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Code2,
  FileText,
  FolderOpen,
  GitCommitHorizontal,
  Github,
  MessageCircle,
  Plus,
  SquareTerminal,
  UserPlus,
  Wallet,
} from "lucide-react";
import type { CalendarEvent, GitCommit, RecentItem } from "@shared/types";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, LoadingRows } from "@/components/ui/primitives";
import { useTasksStore } from "@/stores/useTasksStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useUIStore } from "@/stores/useUIStore";
import { attempt } from "@/lib/api";
import { addDays, formatCurrency, formatDate, formatTime, greeting, relativeDay, timeAgo, todayISO, toLocalDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PRIORITY_LABEL } from "@/components/TaskFormDialog";

const ACTIVITY_ICON: Record<string, typeof Code2> = {
  project: Code2,
  file: FileText,
  task_completed: CheckCircle2,
  client: UserPlus,
  commit: GitCommitHorizontal,
};

const ACTIVITY_TEXT: Record<string, string> = {
  project: "Projeto aberto",
  file: "Arquivo aberto",
  task_completed: "Tarefa concluída",
  client: "Cliente aberto",
  commit: "Commit",
};

export function Dashboard() {
  const navigate = useUIStore((s) => s.navigate);
  const setQuickTaskOpen = useUIStore((s) => s.setQuickTaskOpen);
  const { tasks, loaded: tasksLoaded, load: loadTasks, toggleDone } = useTasksStore();
  const { projects, loaded: projectsLoaded, load: loadProjects, open: openProject } = useProjectsStore();
  const { clients, load: loadClients } = useClientsStore();
  const settings = useSettingsStore((s) => s.settings);

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [activity, setActivity] = useState<RecentItem[]>([]);
  const [commits, setCommits] = useState<(GitCommit & { project: string })[]>([]);

  const today = todayISO();

  useEffect(() => {
    void loadTasks();
    void loadProjects();
    void loadClients();
    void attempt(window.workspace.calendar.list({ from: `${today}T00:00:00`, to: `${toLocalDate(addDays(new Date(), 2))}T23:59:59` })).then(
      (data) => setEvents(data ?? [])
    );
    void attempt(window.workspace.activity.list(12)).then((data) => setActivity(data ?? []));
  }, [loadTasks, loadProjects, loadClients, today]);

  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt))
        .slice(0, 3),
    [projects]
  );

  // Commits recentes dos projetos mais usados (git local, sem rede).
  useEffect(() => {
    const repos = recentProjects.filter((p) => p.git?.isRepo).slice(0, 2);
    if (repos.length === 0) return;
    void Promise.all(
      repos.map(async (p) => ((await attempt(window.workspace.git.commits(p.localPath, 4))) ?? []).map((c) => ({ ...c, project: p.name })))
    ).then((lists) => setCommits(lists.flat().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)));
  }, [recentProjects]);

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
  const billing = clients
    .filter((c) => c.status === "ativo" && c.nextBillingDate && c.nextBillingDate <= toLocalDate(addDays(new Date(), 7)))
    .sort((a, b) => (a.nextBillingDate ?? "").localeCompare(b.nextBillingDate ?? ""))
    .slice(0, 4);
  const lastProject = recentProjects[0];

  const quickActions = [
    { label: "Nova tarefa", icon: Plus, run: () => setQuickTaskOpen(true) },
    { label: "Novo cliente", icon: UserPlus, run: () => navigate("clientes", "new") },
    { label: "Novo projeto", icon: Code2, run: () => navigate("projetos", "new") },
    { label: "Abrir VS Code", icon: Code2, run: () => (lastProject ? void openProject(lastProject, "vscode") : navigate("projetos")) },
    { label: "Abrir terminal", icon: SquareTerminal, run: () => navigate("terminal", lastProject?.id ?? null) },
    { label: "Abrir WhatsApp", icon: MessageCircle, run: () => navigate("whatsapp") },
    { label: "Perguntar para IA", icon: Bot, run: () => navigate("ia") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {greeting()}
            {settings?.userName ? `, ${settings.userName}` : ""}
          </h1>
          <p className="mt-0.5 text-sm first-letter:uppercase text-text-muted">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}
            <span className="normal-case">
              {focusTasks.length} tarefa(s) em foco · {todayEvents.length} compromisso(s) hoje
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {quickActions.map((a) => (
          <Button key={a.label} variant="secondary" size="sm" onClick={a.run}>
            <a.icon size={13} className="text-text-faint" /> {a.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Agenda */}
        <Card>
          <CardHeader
            title="Agenda de hoje"
            icon={<CalendarDays size={12} />}
            action={
              <Button variant="ghost" size="xs" onClick={() => navigate("agenda")}>
                Abrir
              </Button>
            }
          />
          <CardContent>
            {events === null ? (
              <LoadingRows rows={2} />
            ) : todayEvents.length === 0 ? (
              <p className="py-3 text-sm text-text-faint">Nenhum compromisso hoje.</p>
            ) : (
              <ul className="space-y-1">
                {todayEvents.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
                    <span className="w-11 font-mono text-xs tabular-nums text-accent">{formatTime(e.startsAt)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-text">{e.title}</span>
                    {e.source === "google" && <Badge>Google</Badge>}
                  </li>
                ))}
              </ul>
            )}
            {nextEvents.length > 0 && (
              <div className="mt-2 border-t border-border-subtle pt-2">
                {nextEvents.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-1 py-1 text-xs text-text-muted">
                    <span className="w-11 capitalize text-text-faint">{relativeDay(e.startsAt).slice(0, 6)}</span>
                    <span className="truncate">
                      {formatTime(e.startsAt)} · {e.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tarefas */}
        <Card>
          <CardHeader
            title="Tarefas"
            icon={<CheckSquare size={12} />}
            action={
              <div className="flex items-center gap-2">
                {doneToday.length > 0 && <span className="text-[11px] text-success">{doneToday.length} feita(s) hoje</span>}
                <Button variant="ghost" size="xs" onClick={() => navigate("tarefas")}>
                  Ver todas
                </Button>
              </div>
            }
          />
          <CardContent>
            {!tasksLoaded ? (
              <LoadingRows rows={3} />
            ) : focusTasks.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nada pendente para hoje"
                className="py-4"
                action={
                  <Button size="xs" variant="secondary" onClick={() => setQuickTaskOpen(true)}>
                    <Plus size={12} /> Nova tarefa
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-0.5">
                {focusTasks.map((task) => (
                  <li key={task.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-bg-hover">
                    <input
                      type="checkbox"
                      checked={task.status === "concluido"}
                      onChange={() => void toggleDone(task)}
                      className="h-3.5 w-3.5 cursor-pointer accent-accent"
                      aria-label={`Concluir ${task.title}`}
                    />
                    <button className="min-w-0 flex-1 truncate text-left text-sm text-text" onClick={() => navigate("tarefas", task.id)}>
                      {task.title}
                    </button>
                    {(task.priority === "urgente" || task.priority === "alta") && (
                      <Badge tone={task.priority === "urgente" ? "danger" : "warning"}>{PRIORITY_LABEL[task.priority]}</Badge>
                    )}
                    {task.dueDate && task.dueDate < today && <Badge tone="danger">Atrasada</Badge>}
                    {task.dueTime && <span className="font-mono text-[11px] text-text-faint">{task.dueTime}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Atividade */}
        <Card>
          <CardHeader title="Atividade" icon={<GitCommitHorizontal size={12} />} />
          <CardContent>
            {activity.length === 0 && commits.length === 0 ? (
              <p className="py-3 text-sm text-text-faint">Sua atividade recente aparece aqui.</p>
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
                {activity.slice(0, 6).map((a) => {
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
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Projetos recentes */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Projetos recentes"
            icon={<Code2 size={12} />}
            action={
              <Button variant="ghost" size="xs" onClick={() => navigate("projetos")}>
                Todos os projetos
              </Button>
            }
          />
          <CardContent>
            {!projectsLoaded ? (
              <LoadingRows rows={2} />
            ) : recentProjects.length === 0 ? (
              <EmptyState
                icon={Code2}
                title="Nenhum projeto ainda"
                description="Adicione a pasta de um projeto para abrir no VS Code, terminal e GitHub com um clique."
                action={
                  <Button size="sm" onClick={() => navigate("projetos", "new")}>
                    <Plus size={13} /> Adicionar projeto
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {recentProjects.map((project) => (
                  <div key={project.id} className="flex flex-col rounded-lg border border-border-subtle bg-bg-elevated/50 p-3">
                    <button className="text-left" onClick={() => navigate("projetos", project.id)}>
                      <p className="truncate text-sm font-semibold text-text">{project.name}</p>
                      <p className="mt-0.5 truncate text-xs text-text-faint">{project.technologies.join(" • ") || "—"}</p>
                    </button>
                    {project.git?.isRepo && (
                      <p className="mt-1.5 text-[11px] text-text-faint">
                        <span className="font-mono text-text-muted">{project.git.branch}</span>
                        {project.git.modifiedCount > 0 && <span className="text-warning"> · {project.git.modifiedCount} alteração(ões)</span>}
                      </p>
                    )}
                    <div className="mt-auto flex gap-1 pt-3">
                      <Button size="xs" variant="secondary" onClick={() => void openProject(project, "vscode")} title="Abrir no VS Code">
                        <Code2 size={12} /> VS Code
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => navigate("terminal", project.id)} title="Terminal">
                        <SquareTerminal size={12} />
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => void openProject(project, "explorer")} title="Pasta">
                        <FolderOpen size={12} />
                      </Button>
                      {project.githubUrl && (
                        <Button size="xs" variant="secondary" onClick={() => void openProject(project, "github")} title="GitHub">
                          <Github size={12} />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financeiro */}
        <Card>
          <CardHeader
            title="Cobranças (7 dias)"
            icon={<Wallet size={12} />}
            action={
              <Button variant="ghost" size="xs" onClick={() => navigate("clientes")}>
                Clientes
              </Button>
            }
          />
          <CardContent>
            {billing.length === 0 ? (
              <p className="py-3 text-sm text-text-faint">Nenhuma cobrança nos próximos 7 dias.</p>
            ) : (
              <ul className="space-y-1">
                {billing.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => navigate("clientes", c.id)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-bg-hover">
                      <span className="min-w-0 flex-1 truncate text-sm text-text">{c.name}</span>
                      <span className="text-xs tabular-nums text-text-muted">{formatCurrency(c.monthlyValue)}</span>
                      <Badge tone={c.nextBillingDate! < today ? "danger" : c.nextBillingDate === today ? "warning" : "neutral"}>
                        {c.nextBillingDate! < today ? "Vencida" : c.nextBillingDate === today ? "Hoje" : formatDate(c.nextBillingDate)}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
