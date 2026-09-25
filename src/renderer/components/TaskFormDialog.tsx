import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/primitives";
import { useTasksStore } from "@/stores/useTasksStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useClientsStore } from "@/stores/useClientsStore";
import type { Task, TaskPriority, TaskStatus } from "@shared/types";
import { tr } from "@/lib/i18n";

export const PRIORITY_LABEL: Record<TaskPriority, string> = { baixa: tr("Baixa"), normal: tr("Normal"), alta: tr("Alta"), urgente: tr("Urgente") };
export const STATUS_LABEL: Record<TaskStatus, string> = { pendente: tr("Pendente"), em_andamento: tr("Em andamento"), concluido: tr("Concluído") };

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tarefa existente para edição; ausente = criar nova. */
  task?: Task | null;
  defaults?: Partial<Pick<Task, "projectId" | "clientId" | "dueDate" | "status">>;
}

/** Formulário completo de tarefa — usado na página Tarefas, no Ctrl+Shift+T e no tray. */
export function TaskFormDialog({ open, onClose, task, defaults }: Props) {
  const { create, update } = useTasksStore();
  const { projects, loaded: projectsLoaded, load: loadProjects } = useProjectsStore();
  const { clients, loaded: clientsLoaded, load: loadClients } = useClientsStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("pendente");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!projectsLoaded) void loadProjects();
    if (!clientsLoaded) void loadClients();
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? defaults?.status ?? "pendente");
    setPriority(task?.priority ?? "normal");
    setProjectId(task?.projectId ?? defaults?.projectId ?? "");
    setClientId(task?.clientId ?? defaults?.clientId ?? "");
    setDueDate(task?.dueDate ?? defaults?.dueDate ?? "");
    setDueTime(task?.dueTime ?? "");
    setTags(task?.tags.join(", ") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const ok = task
      ? await update(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          projectId: projectId || null,
          clientId: clientId || null,
          dueDate: dueDate || null,
          dueTime: dueDate && dueTime ? dueTime : null,
          tags: tagList,
        })
      : await create({
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          priority,
          projectId: projectId || undefined,
          clientId: clientId || undefined,
          dueDate: dueDate || undefined,
          dueTime: dueDate && dueTime ? dueTime : undefined,
          tags: tagList,
        });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? tr("Editar tarefa") : tr("Nova tarefa")}
      dismissable={false}
      footer={
        <>
          <span className="mr-auto text-[11px] text-text-faint">{tr("Ctrl+Enter para salvar")}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>{tr("Cancelar")}</Button>
          <Button size="sm" onClick={save} disabled={!title.trim()} loading={saving}>
            {task ? tr("Salvar") : tr("Criar tarefa")}
          </Button>
        </>
      }
    >
      <div
        className="space-y-3"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
        }}
      >
        <input
          className="input text-[15px] font-medium"
          placeholder={tr("O que precisa ser feito?")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void save()}
        />
        <textarea
          className="input min-h-[70px] resize-y"
          placeholder={tr("Descrição (opcional)")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("Status")}>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr("Prioridade")}>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr("Prazo")}>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label={tr("Horário (opcional)")}>
            <input type="time" className="input" value={dueTime} disabled={!dueDate} onChange={(e) => setDueTime(e.target.value)} />
          </Field>
          <Field label={tr("Projeto")}>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{tr("Nenhum")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr("Cliente")}>
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">{tr("Nenhum")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={tr("Tags")} hint={tr("Separe por vírgula: site, urgente, instagram")}>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder={tr("site, cliente")} />
        </Field>
      </div>
    </Dialog>
  );
}
