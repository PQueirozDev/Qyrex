import { create } from "zustand";
import type { CalendarEvent } from "@shared/types";
import { attempt, errorMessage, unwrap } from "@/lib/api";

type CreateInput = Parameters<typeof window.workspace.calendar.create>[0];
type UpdatePatch = Parameters<typeof window.workspace.calendar.update>[1];

interface CalendarState {
  events: CalendarEvent[];
  range: { from: string; to: string } | null;
  loading: boolean;
  error: string | null;
  load: (range?: { from: string; to: string }) => Promise<void>;
  create: (input: CreateInput) => Promise<boolean>;
  update: (id: string, patch: UpdatePatch) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  range: null,
  loading: false,
  error: null,

  load: async (range) => {
    const effective = range ?? get().range ?? undefined;
    set({ loading: true, error: null, range: effective ?? null });
    try {
      set({ events: await unwrap(window.workspace.calendar.list(effective)) });
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },
  create: async (input) => {
    const ok = await attempt(window.workspace.calendar.create(input), "Evento criado");
    if (ok) await get().load();
    return Boolean(ok);
  },
  update: async (id, patch) => {
    const ok = await attempt(window.workspace.calendar.update(id, patch), "Evento atualizado");
    if (ok) await get().load();
    return Boolean(ok);
  },
  remove: async (id) => {
    await attempt(window.workspace.calendar.delete(id), "Evento excluído");
    await get().load();
  },
}));
