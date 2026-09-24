import { create } from "zustand";
import type { MarketingContent } from "@shared/types";
import { attempt, errorMessage, unwrap } from "@/lib/api";

type CreateInput = Parameters<typeof window.workspace.marketing.create>[0];
type UpdatePatch = Parameters<typeof window.workspace.marketing.update>[1];

interface MarketingState {
  items: MarketingContent[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (input: CreateInput) => Promise<boolean>;
  update: (id: string, patch: UpdatePatch) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
}

export const useMarketingStore = create<MarketingState>((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ items: await unwrap(window.workspace.marketing.list()), loaded: true });
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },
  create: async (input) => {
    const ok = await attempt(window.workspace.marketing.create(input), "Conteúdo salvo");
    if (ok) await get().load();
    return Boolean(ok);
  },
  update: async (id, patch) => {
    set({ items: get().items.map((i) => (i.id === id ? ({ ...i, ...patch } as MarketingContent) : i)) });
    const ok = await attempt(window.workspace.marketing.update(id, patch));
    await get().load();
    return Boolean(ok);
  },
  remove: async (id) => {
    await attempt(window.workspace.marketing.delete(id), "Conteúdo excluído");
    await get().load();
  },
}));
