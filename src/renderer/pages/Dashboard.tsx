import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
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
import { Avatar, Badge, EmptyState, LoadingRows } from "@/components/ui/primitives";
import { useTasksStore } from "@/stores/useTasksStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useUIStore } from "@/stores/useUIStore";
import { attempt } from "@/lib/api";
import { addDays, toLocalDateTime, formatCurrency, formatDate, formatTime, greeting, shortDay, timeAgo, todayISO, toLocalDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PRIORITY_LABEL } from "@/components/TaskFormDialog";

import { getLocale, tr, trn } from "@/lib/i18n";
import { AnimatedValue } from "@/components/ui/AnimatedValue";
import { ProfileAvatar } from "@/components/ProfileAvatar";
const ACTIVITY_ICON: Record<string, typeof Code2> = {
  project: Code2,
  file: FileText,
  task_completed: CheckCircle2,
  client: UserPlus,
  commit: GitCommitHorizontal,
};

const ACTIVITY_TEXT: Record<string, string> = {
  project: tr("Projeto aberto"),
  file: tr("Arquivo aberto"),
  task_completed: tr("Tarefa concluída"),
  client: tr("Cliente aberto"),
  commit: tr("Commit"),
};

const TILE_TONES = {
  accent: "bg-accent/10 text-accent ring-accent/20",
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/10 text-warning ring-warning/20",
  danger: "bg-danger/10 text-danger ring-danger/20",
  neutral: "bg-bg-hover text-text-muted ring-border",
} as const;

/** Variável CSS da cor de cada tom (para o brilho do hover). */
const TILE_GLOW: Record<keyof typeof TILE_TONES, string> = {
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  neutral: "var(--text-faint)",
};

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  icon: typeof Code2;
  label: string;
  value: string | number;
  sub: string;
  tone: keyof typeof TILE_TONES;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card-interactive surface group relative overflow-hidden rounded-card border border-border-subtle bg-bg-card p-4 text-left shadow-card"
    >
      {/* Brilho na cor do card que acende no hover. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `rgb(${TILE_GLOW[tone]} / 0.22)` }}
      />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-text-muted">
          {label}
          <ArrowUpRight size={12} className="-translate-x-1 text-text-faint opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
        </span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset", TILE_TONES[tone])}>
          <Icon size={15} />
        </span>
      </div>
      <p className="relative mt-2 text-[26px] font-semibold leading-tight tabular-nums tracking-tight text-text">
        <AnimatedValue value={value} />
      </p>
      <p className="relative mt-0.5 truncate text-[11px] text-text-faint">{sub}</p>
    </button>
  );
}

export function Dashboard() {
  const navigate = useUIStore((s) => s.navigate);
  const setQuickTaskOpen = useUIStore((s) => s.setQuickTaskOpen);
  const { tasks, loaded: tasksLoaded, load: loadTasks, toggleDone } = useTasksStore();
  const { projects, loaded: projectsLoaded, load: loadProjects, open: openProject } = useProjectsStore();
  const { clients, load: loadClients } = useClientsStore();
  const settings = useSettingsStore((s) => s.settings);
  const avatar = useSettingsStore((s) => s.avatar);

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
  const overdue = tasks.filter((t) => t.status !== "concluido" && t.dueDate && t.dueDate < today).length;
  const nowTime = toLocalDateTime(new Date());
  const nextToday = todayEvents.find((e) => e.startsAt >= nowTime);
  const pendingChanges = projects.filter((p) => (p.git?.modifiedCount ?? 0) > 0).length;
  const activeClients = clients.filter((c) => c.status === "ativo").length;
  const monthlyTotal = clients.filter((c) => c.status === "ativo").reduce((sum, c) => sum + (c.monthlyValue ?? 0), 0);

  const quickActions = [
    { label: tr("Nova tarefa"), icon: Plus, run: () => setQuickTaskOpen(true) },
    { label: tr("Novo cliente"), icon: UserPlus, run: () => navigate("clientes", "new") },
    { label: tr("Novo projeto"), icon: Code2, run: () => navigate("projetos", "new") },
    { label: tr("Abrir VS Code"), icon: Code2, run: () => (lastProject ? void openProject(lastProject, "vscode") : navigate("projetos")) },
    { label: tr("Abrir terminal"), icon: SquareTerminal, run: () => navigate("terminal", lastProject?.id ?? null) },
    { label: tr("Abrir WhatsApp"), icon: MessageCircle, run: () => navigate("whatsapp") },
    { label: tr("Perguntar para IA"), icon: Bot, run: () => navigate("ia") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          {avatar && <ProfileAvatar size={54} className="shadow-card ring-2 ring-accent/30" />}
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-text">
              {greeting()}
              {settings?.userName && (
                <>
                  {", "}
                  <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">{settings.userName}</span>
                </>
              )}
            </h1>
            <p className="mt-0.5 text-sm first-letter:uppercase text-text-muted">
              {new Date().toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "long" })}
              {" · "}
              <span className="normal-case">
                {trn(focusTasks.length, "{n} tarefa em foco", "{n} tarefas em foco")}
                {" · "}
                {trn(todayEvents.length, "{n} compromisso hoje", "{n} compromissos hoje")}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          icon={CheckSquare}
          label={tr("Tarefas em foco")}
          value={focusTasks.length}
          sub={overdue > 0 ? trn(overdue, "{n} atrasada", "{n} atrasadas") : trn(doneToday.length, "{n} concluída hoje", "{n} concluídas hoje")}
          tone={overdue > 0 ? "danger" : "accent"}
          onClick={() => navigate("tarefas")}
        />
        <StatTile
          icon={CalendarDays}
          label={tr("Compromissos hoje")}
          value={todayEvents.length}
          sub={nextToday ? tr("Próximo às {time}", { time: formatTime(nextToday.startsAt) }) : tr("Agenda livre")}
          tone="success"
          onClick={() => navigate("agenda")}
        />
        <StatTile
          icon={Code2}
          label={tr("Projetos")}
          value={projects.length}
          sub={pendingChanges > 0 ? tr("{n} com alterações no Git", { n: pendingChanges }) : tr("Tudo commitado")}
          tone="warning"
          onClick={() => navigate("projetos")}
        />
        <StatTile
          icon={Wallet}
          label={tr("Manutenção mensal")}
          value={formatCurrency(monthlyTotal) || formatCurrency(0)}
          sub={trn(activeClients, "{n} cliente ativo", "{n} clientes ativos")}
          tone="neutral"
          onClick={() => navigate("clientes")}
        />
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
            title={tr("Agenda de hoje")}
            icon={<CalendarDays size={12} />}
            action={
              <Button variant="ghost" size="xs" onClick={() => navigate("agenda")}>{tr("Abrir")}</Button>
            }
          />
          <CardContent>
            {events === null ? (
              <LoadingRows rows={2} />
            ) : todayEvents.length === 0 ? (
              <p className="py-3 text-sm text-text-faint">{tr("Nenhum compromisso hoje.")}</p>
            ) : (
              // Linha do tempo: o que já passou fica apagado e o próximo compromisso pulsa.
              <ul className="relative">
                <span aria-hidden className="absolute bottom-4 left-[64.5px] top-4 w-px bg-border" />
                {todayEvents.map((e) => {
                  const past = (e.endsAt ?? e.startsAt) < nowTime;
                  const isNext = e.id === nextToday?.id;
                  return (
                    <li key={e.id} className={cn("relative flex items-center gap-3 rounded-md px-1 py-1.5", past && "opacity-45")}>
                      <span className={cn("w-11 font-mono text-xs tabular-nums", isNext ? "text-accent" : "text-text-muted")}>{formatTime(e.startsAt)}</span>
                      <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                        {isNext && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/50" />}
                        <span
                          className={cn(
                            "relative h-2.5 w-2.5 rounded-full ring-[3px] ring-bg-card",
                            isNext ? "bg-accent" : past ? "bg-text-faint" : "bg-border"
                          )}
                        />
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate text-sm", isNext ? "font-medium text-text" : "text-text")}>{e.title}</span>
                      {isNext && <Badge tone="accent">{tr("Próximo")}</Badge>}
                      {e.source === "google" && <Badge>{tr("Google")}</Badge>}
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
          </CardContent>
        </Card>

        {/* Tarefas */}
        <Card>
          <CardHeader
            title={tr("Tarefas")}
            icon={<CheckSquare size={12} />}
            action={
              <div className="flex items-center gap-2">
                {doneToday.length > 0 && <span className="text-[11px] text-success">{trn(doneToday.length, "{n} feita hoje", "{n} feitas hoje")}</span>}
                <Button variant="ghost" size="xs" onClick={() => navigate("tarefas")}>{tr("Ver todas")}</Button>
              </div>
            }
          />
          <CardContent>
            {!tasksLoaded ? (
              <LoadingRows rows={3} />
            ) : focusTasks.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title={tr("Nada pendente para hoje")}
                className="py-4"
                action={
                  <Button size="xs" variant="secondary" onClick={() => setQuickTaskOpen(true)}>
                    <Plus size={12} />{" "}{tr("Nova tarefa")}</Button>
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
                      aria-label={tr("Concluir {name}", { name: task.title })}
                    />
                    <button className="min-w-0 flex-1 truncate text-left text-sm text-text" onClick={() => navigate("tarefas", task.id)}>
                      {task.title}
                    </button>
                    {(task.priority === "urgente" || task.priority === "alta") && (
                      <Badge tone={task.priority === "urgente" ? "danger" : "warning"}>{PRIORITY_LABEL[task.priority]}</Badge>
                    )}
                    {task.dueDate && task.dueDate < today && <Badge tone="danger">{tr("Atrasada")}</Badge>}
                    {task.dueTime && <span className="font-mono text-[11px] text-text-faint">{task.dueTime}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Atividade */}
        <Card>
          <CardHeader title={tr("Atividade")} icon={<GitCommitHorizontal size={12} />} />
          <CardContent>
            {activity.length === 0 && commits.length === 0 ? (
              <p className="py-3 text-sm text-text-faint">{tr("Sua atividade recente aparece aqui.")}</p>
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
            title={tr("Projetos recentes")}
            icon={<Code2 size={12} />}
            action={
              <Button variant="ghost" size="xs" onClick={() => navigate("projetos")}>{tr("Todos os projetos")}</Button>
            }
          />
          <CardContent>
            {!projectsLoaded ? (
              <LoadingRows rows={2} />
            ) : recentProjects.length === 0 ? (
              <EmptyState
                icon={Code2}
                title={tr("Nenhum projeto ainda")}
                description={tr("Adicione a pasta de um projeto para abrir no VS Code, terminal e GitHub com um clique.")}
                action={
                  <Button size="sm" onClick={() => navigate("projetos", "new")}>
                    <Plus size={13} />{" "}{tr("Adicionar projeto")}</Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {recentProjects.map((project) => (
                  <div key={project.id} className="card-interactive flex flex-col rounded-lg border border-border-subtle bg-bg-elevated/50 p-3">
                    <button className="flex items-center gap-2.5 text-left" onClick={() => navigate("projetos", project.id)}>
                      <Avatar name={project.name} size={30} className="rounded-lg" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-text">{project.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-text-faint">{project.technologies.join(" • ") || "—"}</span>
                      </span>
                    </button>
                    {project.git?.isRepo && (
                      <p className="mt-1.5 text-[11px] text-text-faint">
                        <span className="font-mono text-text-muted">{project.git.branch}</span>
                        {project.git.modifiedCount > 0 && <span className="text-warning"> · {trn(project.git.modifiedCount, "{n} alteração", "{n} alterações")}</span>}
                      </p>
                    )}
                    <div className="mt-auto flex gap-1 pt-3">
                      <Button size="xs" variant="secondary" onClick={() => void openProject(project, "vscode")} title={tr("Abrir no VS Code")}>
                        <Code2 size={12} />{" "}{tr("VS Code")}</Button>
                      <Button size="xs" variant="secondary" onClick={() => navigate("terminal", project.id)} title={tr("Terminal")}>
                        <SquareTerminal size={12} />
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => void openProject(project, "explorer")} title={tr("Pasta")}>
                        <FolderOpen size={12} />
                      </Button>
                      {project.githubUrl && (
                        <Button size="xs" variant="secondary" onClick={() => void openProject(project, "github")} title={tr("GitHub")}>
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
            title={tr("Cobranças (7 dias)")}
            icon={<Wallet size={12} />}
            action={
              <Button variant="ghost" size="xs" onClick={() => navigate("clientes")}>{tr("Clientes")}</Button>
            }
          />
          <CardContent>
            {billing.length === 0 ? (
              <p className="py-3 text-sm text-text-faint">{tr("Nenhuma cobrança nos próximos 7 dias.")}</p>
            ) : (
              <ul className="space-y-1">
                {billing.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => navigate("clientes", c.id)} className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-bg-hover">
                      <span className="min-w-0 flex-1 truncate text-sm text-text">{c.name}</span>
                      <span className="text-xs tabular-nums text-text-muted">{formatCurrency(c.monthlyValue)}</span>
                      <Badge tone={c.nextBillingDate! < today ? "danger" : c.nextBillingDate === today ? "warning" : "neutral"}>
                        {c.nextBillingDate! < today ? tr("Vencida") : c.nextBillingDate === today ? tr("Hoje") : formatDate(c.nextBillingDate)}
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
