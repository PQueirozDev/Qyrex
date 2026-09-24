import { create } from "zustand";
import type { AppSettings, SystemInfo } from "@shared/types";
import { attempt } from "@/lib/api";

type SettingsPatch = Parameters<typeof window.workspace.settings.update>[0];

interface SettingsState {
  settings: AppSettings | null;
  system: SystemInfo | null;
  load: () => Promise<void>;
  loadSystem: () => Promise<void>;
  update: (patch: SettingsPatch) => Promise<void>;
  addAllowedDir: (dir?: string) => Promise<boolean>;
  removeAllowedDir: (dir: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  system: null,

  load: async () => {
    const data = await attempt(window.workspace.settings.get());
    if (data) set({ settings: data });
  },
  loadSystem: async () => {
    const data = await attempt(window.workspace.system.info());
    if (data) set({ system: data });
  },
  update: async (patch) => {
    // Atualização otimista: a UI responde na hora; o valor do banco prevalece.
    set((s) => ({ settings: s.settings ? { ...s.settings, ...patch } : s.settings }));
    const data = await attempt(window.workspace.settings.update(patch));
    if (data) set({ settings: data });
  },
  addAllowedDir: async (dir) => {
    const data = await attempt(window.workspace.settings.addAllowedDir(dir));
    if (data) set({ settings: data });
    return Boolean(data);
  },
  removeAllowedDir: async (dir) => {
    const data = await attempt(window.workspace.settings.removeAllowedDir(dir));
    if (data) set({ settings: data });
  },
}));

/** Aplica Dark / Light / System na raiz do documento. */
export function applyTheme(theme: AppSettings["theme"]): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const dark = theme === "dark" || (theme === "system" && media.matches);
    document.documentElement.classList.toggle("dark", dark);
  };
  apply();
  if (theme !== "system") return () => undefined;
  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}
