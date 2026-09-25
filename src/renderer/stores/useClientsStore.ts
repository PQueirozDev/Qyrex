import { create } from "zustand";
import type { Client } from "@shared/types";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { tr } from "@/lib/i18n";

type CreateInput = Parameters<typeof window.workspace.clients.create>[0];
type UpdatePatch = Parameters<typeof window.workspace.clients.update>[1];

interface ClientsState {
  clients: Client[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (input: CreateInput) => Promise<Client | undefined>;
  update: (id: string, patch: UpdatePatch) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

export const useClientsStore = create<ClientsState>((set, get) => ({
  clients: [],
  loading: false,
  loaded: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ clients: await unwrap(window.workspace.clients.list()), loaded: true });
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },
  create: async (input) => {
    const client = await attempt(window.workspace.clients.create(input), tr("Cliente criado"));
    if (client) await get().load();
    return client;
  },
  update: async (id, patch) => {
    const ok = await attempt(window.workspace.clients.update(id, patch));
    if (ok) await get().load();
    return Boolean(ok);
  },
  remove: async (id) => {
    await attempt(window.workspace.clients.delete(id), tr("Cliente excluído"));
    await get().load();
  },
}));
