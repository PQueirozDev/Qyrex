import { useEffect, useMemo, useState } from "react";
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

type View = "hoje" | "proximas" | "todas" | "concluidas";

const PRIORITY_TONE = { baixa: "neutral", normal: "neutral", alta: "warning", urgente: "danger" } as const;

function TaskRow({ task, onEdit }: { task: Task; onEdit: (t: Task) => void }) {
  const { toggleDone, remove, update } = useTasksStore();
  const projects = useProjectsStore((s) => s.projects);
  const clients = useClientsStore((s) => s.clients);
  const today = todayISO();
  const project = projects.find((p) => p.id === task.projectId);
  const client = clients.find((c) => c.id === task.clientId);
  const done = task.status === "concluido";

  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-hover/50">
      <input
        type="checkbox"
        checked={done}
        onChange={() => void toggleDone(task)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
        aria-label={done ? "Reabrir" : "Concluir"}
      />
      <button className="min-w-0 flex-1 text-left" onClick={() => onEdit(task)}>
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm", done ? "text-text-faint line-through" : "text-text")}>{task.title}</span>
          {task.status === "em_andamento" && <Badge tone="accent">Em andamento</Badge>}
        </div>
        {(task.description || project || client || task.tags.length > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-text-faint">
            {project && <span>{project.name}</span>}
            {client && <span>· {client.name}</span>}
            {task.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
            {task.description && <span className="max-w-[320px] truncate">· {task.description}</span>}
          </div>
        )}
      </button>
      {task.priority !== "normal" && <Badge tone={PRIORITY_TONE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>}
      {task.dueDate && (
        <span className={cn("w-24 text-right text-[11px] capitalize", !done && task.dueDate < today ? "text-danger" : "text-text-faint")}>
          {relativeDay(task.dueDate)}
          {task.dueTime ? ` ${task.dueTime}` : ""}
        </span>
      )}
      <div className="opacity-0 transition-opacity group-hover:opacity-100">
        <Menu
          trigger={<MoreHorizontal size={15} />}
          items={[
            { label: "Editar", icon: Pencil, onSelect: () => onEdit(task) },
            ...(["pendente", "em_andamento", "concluido"] as TaskStatus[])
              .filter((s) => s !== task.status)
              .map((s) => ({ label: `Marcar: ${STATUS_LABEL[s]}`, icon: CheckSquare, onSelect: () => void update(task.id, { status: s }) })),
            "separator",
            {
              label: "Excluir",
              icon: Trash2,
              danger: true,
              onSelect: async () => {
                if (await confirmAction({ title: `Excluir "${task.title}"?`, description: "Essa ação não pode ser desfeita.", danger: true, confirmLabel: "Excluir" }))
                  void remove(task.id);
              },
            },
          ]}
        />
      </div>
    </div>
  );
}

function Kanban({ tasks, onEdit }: { tasks: Task[]; onEdit: (t: Task) => void }) {
  const { update } = useTasksStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const columns: TaskStatus[] = ["pendente", "em_andamento", "concluido"];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {columns.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragId) void update(dragId, { status });
              setDragId(null);
            }}
            className="min-h-[200px] rounded-card border border-border-subtle bg-bg-elevated/40 p-2"
          >
            <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
              <span className="section-title">{STATUS_LABEL[status]}</span>
              <span className="text-[11px] text-text-faint">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  onClick={() => onEdit(t)}
                  className="cursor-grab rounded-lg border border-border-subtle bg-bg-card p-2.5 shadow-card active:cursor-grabbing"
                >
                  <p className={cn("text-[13px]", status === "concluido" ? "text-text-faint line-through" : "text-text")}>{t.title}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {t.priority !== "normal" && <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>}
                    {t.dueDate && <span className="text-[11px] capitalize text-text-faint">{relativeDay(t.dueDate)}</span>}
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
        title="Tarefas"
        description={`${counts.todas} pendente(s) · ${counts.hoje} para hoje ou atrasada(s)`}
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
              <Plus size={14} /> Nova tarefa
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {layout === "lista" && (
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "hoje", label: "Hoje", count: counts.hoje },
              { value: "proximas", label: "Próximas", count: counts.proximas },
              { value: "todas", label: "Todas", count: counts.todas },
              { value: "concluidas", label: "Concluídas" },
            ]}
          />
        )}
        <select className="input w-44 py-1 text-xs" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input className="input ml-auto w-56 py-1 text-xs" placeholder="Filtrar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              placeholder={view === "hoje" ? "Adicionar tarefa para hoje e pressionar Enter..." : "Adicionar tarefa e pressionar Enter..."}
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
              title={view === "concluidas" ? "Nenhuma tarefa concluída ainda" : search ? "Nenhuma tarefa encontrada" : "Tudo em dia por aqui"}
              description={view === "hoje" ? "Tarefas com prazo para hoje ou atrasadas aparecem aqui." : undefined}
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
