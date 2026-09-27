import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckSquare, Columns3, List, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import type { Task, TaskStatus } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, EmptyState, ErrorState, LoadingRows, Menu, PageHeader, Segmented } from "@/components/ui/primitives";
import { PRIORITY_LABEL, STATUS_LABEL, TaskFormDialog } from "@/components/TaskFormDialog";
import { cn } from "@/lib/cn";
import { relativeDay, todayISO } from "@/lib/format";
import { fuzzyFilter } from "@/lib/fuzzy";
import { useTasksStore } from "@/stores/useTasksStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { confirmAction, useUIStore } from "@/stores/useUIStore";
import { tr, trn } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";

type View = "hoje" | "proximas" | "todas" | "concluidas";

const PRIORITY_TONE = { baixa: "neutral", normal: "neutral", alta: "warning", urgente: "danger" } as const;

const MetaDot = () => <span className="shrink-0 text-text-faint/50">•</span>;

function TaskRow({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const { toggleDone, remove, update } = useTasksStore();
  const projects = useProjectsStore((s) => s.projects);
  const clients = useClientsStore((s) => s.clients);
  const today = todayISO();
  const project = projects.find((p) => p.id === task.projectId);
  const client = clients.find((c) => c.id === task.clientId);
  const done = task.status === "concluido";
  const meta = [project?.name, client?.name].filter((part): part is string => Boolean(part));

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-hover/50">
      <input
        type="checkbox"
        checked={done}
        onChange={() => void toggleDone(task)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
        aria-label={done ? tr("Reabrir") : tr("Concluir")}
      />
      <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(task)}>
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm", done ? "text-text-faint line-through" : "text-text")}>{task.title}</span>
          {task.status === "em_andamento" && <Badge tone="accent">{tr("Em andamento")}</Badge>}
        </div>
        {(meta.length > 0 || task.tags.length > 0 || task.description) && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-text-faint">
            {/* Separador só entre itens que existem (antes sobrava "· Cliente" quando não havia projeto). */}
            {meta.map((part, i) => (
              <Fragment key={part}>
                {i > 0 && <MetaDot />}
                <span className="shrink-0">{part}</span>
              </Fragment>
            ))}
            {task.tags.map((t) => (
              <span key={t} className="shrink-0 rounded bg-bg-hover px-1 text-text-muted">#{t}</span>
            ))}
            {task.description && (
              <>
                {(meta.length > 0 || task.tags.length > 0) && <MetaDot />}
                <span className="min-w-0 truncate">{task.description}</span>
              </>
            )}
          </div>
        )}
      </button>
      {task.priority !== "normal" && <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>}
      {task.dueDate && (
        <span className={cn("w-24 text-right text-[11px] first-letter:uppercase", !done && task.dueDate < today ? "text-danger" : "text-text-faint")}>
          {relativeDay(task.dueDate)}
          {task.dueTime ? ` ${task.dueTime}` : ""}
        </span>
      )}
      <div className="opacity-0 transition-opacity group-hover:opacity-100">
        <Menu
          trigger={<MoreHorizontal size={15} />}
          items={[
            { label: tr("Editar"), icon: Pencil, onSelect: () => onEdit(task) },
            ...(["pendente", "em_andamento", "concluido"] as TaskStatus[])
              .filter((s) => s !== task.status)
              .map((s) => ({ label: tr("Marcar: {status}", { status: STATUS_LABEL[s] }), icon: CheckSquare, onSelect: () => void update(task.id, { status: s }) })),
            "separator",
            {
              label: tr("Excluir"),
              icon: Trash2,
              danger: true,
              onSelect: async () => {
                if (await confirmAction({ title: tr("Excluir \"{name}\"?", { name: task.title }), description: tr("Essa ação não pode ser desfeita."), danger: true, confirmLabel: tr("Excluir") }))
                  void remove(task.id);
              },
            },
          ]}
        />
      </div>
    </div>
  );
}

const STATUS_DOT: Record<TaskStatus, string> = {
  pendente: "bg-text-faint",
  em_andamento: "bg-accent shadow-[0_0_8px_rgb(var(--accent)/0.7)]",
  concluido: "bg-success",
};

function Kanban({ tasks, onEdit }: { tasks: Task[]; onEdit: (t: Task) => void }) {
  const { update } = useTasksStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const columns: TaskStatus[] = ["pendente", "em_andamento", "concluido"];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {columns.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== status) setOver(status);
            }}
            onDragLeave={(e) => {
              // Só apaga ao sair da coluna de verdade (não ao passar por cima de um card dela).
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={() => {
              if (dragId) void update(dragId, { status });
              setDragId(null);
              setOver(null);
            }}
            className={cn(
              "min-h-[200px] rounded-card border p-2 transition-[background-color,border-color,box-shadow] duration-200",
              over === status && dragId
                ? "border-accent/50 bg-accent/[0.06] shadow-[inset_0_0_0_1px_rgb(var(--accent)/0.25)]"
                : "border-border-subtle bg-bg-elevated/40"
            )}
          >
            <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
                <span className="section-title">{STATUS_LABEL[status]}</span>
              </span>
              <span className="rounded-full bg-bg-hover px-1.5 text-[11px] tabular-nums text-text-faint">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 && (
                <div
                  className={cn(
                    "rounded-lg border border-dashed py-6 text-center text-[11px] transition-colors",
                    over === status && dragId ? "border-accent/50 text-accent" : "border-border-subtle text-text-faint"
                  )}
                >
                  {tr("Arraste um card para cá")}
                </div>
              )}
              {items.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onClick={() => onEdit(t)}
                  className={cn(
                    "card-interactive cursor-grab rounded-lg border border-border-subtle bg-bg-card p-2.5 shadow-card active:cursor-grabbing",
                    dragId === t.id && "scale-[0.98] opacity-40"
                  )}
                >
                  <p className={cn("text-[13px]", status === "concluido" ? "text-text-faint line-through" : "text-text")}>{t.title}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {t.priority !== "normal" && <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>}
                    {t.dueDate && <span className="inline-block text-[11px] text-text-faint first-letter:uppercase">{relativeDay(t.dueDate)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Tasks() {
  const { tasks, loaded, loading, error, load, create } = useTasksStore();
  const { loaded: projectsLoaded, load: loadProjects, projects } = useProjectsStore();
  const { loaded: clientsLoaded, load: loadClients } = useClientsStore();
  const pageParam = useUIStore((s) => s.pageParam);

  const [view, setView] = useState<View>("hoje");
  const [layout, setLayout] = useState<"lista" | "kanban">("lista");
  const [quickTitle, setQuickTitle] = useState("");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
    if (!projectsLoaded) void loadProjects();
    if (!clientsLoaded) void loadClients();
  }, [load, projectsLoaded, clientsLoaded, loadProjects, loadClients]);

  // Abrir uma tarefa específica vinda da busca/Dashboard.
  useEffect(() => {
    if (!pageParam || !loaded) return;
    const task = tasks.find((t) => t.id === pageParam);
    if (task) setEditing(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageParam, loaded]);

  const today = todayISO();
  const counts = useMemo(
    () => ({
      hoje: tasks.filter((t) => t.status !== "concluido" && t.dueDate && t.dueDate <= today).length,
      proximas: tasks.filter((t) => t.status !== "concluido" && t.dueDate && t.dueDate > today).length,
      todas: tasks.filter((t) => t.status !== "concluido").length,
      concluidas: tasks.filter((t) => t.status === "concluido").length,
    }),
    [tasks, today]
  );

  const filtered = useMemo(() => {
    let list = tasks;
    if (projectFilter) list = list.filter((t) => t.projectId === projectFilter);
    if (layout === "lista") {
      list = list.filter((t) => {
        switch (view) {
          case "hoje":
            return t.status !== "concluido" && !!t.dueDate && t.dueDate <= today;
          case "proximas":
            return t.status !== "concluido" && !!t.dueDate && t.dueDate > today;
          case "concluidas":
            return t.status === "concluido";
          default:
            return t.status !== "concluido";
        }
      });
    }
    if (view === "concluidas") list = [...list].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return fuzzyFilter(list, search, (t) => `${t.title} ${t.description ?? ""} ${t.tags.join(" ")}`);
  }, [tasks, view, today, search, projectFilter, layout]);

  async function quickAdd() {
    const title = quickTitle.trim();
    if (!title) return;
    const ok = await create({ title, dueDate: view === "hoje" ? today : undefined, projectId: projectFilter || undefined });
    if (ok) setQuickTitle("");
  }

  return (
    <div>
      <PageHeader
        title={tr("Tarefas")}
        icon={PAGE_ICONS.tarefas}
        description={`${trn(counts.todas, "{n} pendente", "{n} pendentes")} · ${trn(counts.hoje, "{n} para hoje ou atrasada", "{n} para hoje ou atrasadas")}`}
        actions={
          <>
            <Segmented
              value={layout}
              onChange={setLayout}
              options={[
                { value: "lista", label: <List size={13} /> },
                { value: "kanban", label: <Columns3 size={13} /> },
              ]}
            />
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} />{" "}{tr("Nova tarefa")}</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {layout === "lista" && (
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "hoje", label: tr("Hoje"), count: counts.hoje },
              { value: "proximas", label: tr("Próximas"), count: counts.proximas },
              { value: "todas", label: tr("Todas"), count: counts.todas },
              { value: "concluidas", label: tr("Concluídas") },
            ]}
          />
        )}
        <select className="input w-44 py-1 text-xs" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">{tr("Todos os projetos")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input className="input ml-auto w-56 py-1 text-xs" placeholder={tr("Filtrar tarefas...")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {layout === "kanban" ? (
        <Kanban tasks={filtered} onEdit={setEditing} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
            <Plus size={15} className="text-text-faint" />
            <input
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void quickAdd()}
              placeholder={view === "hoje" ? tr("Adicionar tarefa para hoje e pressionar Enter...") : tr("Adicionar tarefa e pressionar Enter...")}
              className="flex-1 bg-transparent py-1 text-sm text-text placeholder:text-text-faint focus:outline-none"
            />
          </div>
          {!loaded && loading ? (
            <div className="p-4">
              <LoadingRows />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title={view === "concluidas" ? tr("Nenhuma tarefa concluída ainda") : search ? tr("Nenhuma tarefa encontrada") : tr("Tudo em dia por aqui")}
              description={view === "hoje" ? tr("Tarefas com prazo para hoje ou atrasadas aparecem aqui.") : undefined}
            />
          ) : (
            <div className="divide-y divide-border-subtle">
              {filtered.map((task) => (
                <TaskRow key={task.id} task={task} onEdit={setEditing} />
              ))}
            </div>
          )}
        </Card>
      )}

      <TaskFormDialog
        open={creating || !!editing}
        task={editing}
        defaults={{ projectId: projectFilter || null, dueDate: !editing && view === "hoje" ? today : null }}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
