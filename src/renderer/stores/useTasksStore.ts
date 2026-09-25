import { create } from "zustand";
import type { Task } from "@shared/types";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { tr } from "@/lib/i18n";

type CreateInput = Parameters<typeof window.workspace.tasks.create>[0];
type UpdatePatch = Parameters<typeof window.workspace.tasks.update>[1];

interface TasksState {
  tasks: Task[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (input: CreateInput) => Promise<boolean>;
  update: (id: string, patch: UpdatePatch) => Promise<boolean>;
  toggleDone: (task: Task) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: false,
  loaded: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ tasks: await unwrap(window.workspace.tasks.list()), loaded: true });
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },
  create: async (input) => {
    const ok = await attempt(window.workspace.tasks.create(input), tr("Tarefa criada"));
    if (ok) await get().load();
    return Boolean(ok);
  },
  update: async (id, patch) => {
    const ok = await attempt(window.workspace.tasks.update(id, patch));
    if (ok) await get().load();
    return Boolean(ok);
  },
  toggleDone: async (task) => {
    const status = task.status === "concluido" ? "pendente" : "concluido";
    set({ tasks: get().tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) });
    await attempt(window.workspace.tasks.update(task.id, { status }));
    await get().load();
  },
  remove: async (id) => {
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
    await attempt(window.workspace.tasks.delete(id), tr("Tarefa excluída"));
  },
}));
