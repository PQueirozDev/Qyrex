import { create } from "zustand";
import type { PluginInfo, PluginPermission } from "@shared/types";
import { attempt } from "@/lib/api";

/** Plugins instalados (embutidos e locais) e quais capacidades estão ativas. */
interface PluginsState {
  plugins: PluginInfo[];
  loaded: boolean;
  load: () => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  isActive: (permission: PluginPermission) => boolean;
}

export const usePluginsStore = create<PluginsState>((set, get) => ({
  plugins: [],
  loaded: false,
  load: async () => {
    const list = await attempt(window.workspace.plugins.list());
    if (list) set({ plugins: list, loaded: true });
  },
  setEnabled: async (id, enabled) => {
    const list = await attempt(window.workspace.plugins.setEnabled(id, enabled));
    if (list) set({ plugins: list });
  },
  // Antes de carregar, considera ativo (os embutidos vêm ligados) para não piscar a UI.
  isActive: (permission) => !get().loaded || get().plugins.some((p) => p.enabled && p.manifest.permissions.includes(permission)),
}));
