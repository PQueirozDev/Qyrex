import { create } from "zustand";
import type { AppSettings, SystemInfo } from "@shared/types";
import { attempt } from "@/lib/api";
import { getTheme } from "@/lib/themes";

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

/**
 * Aplica o tema: `data-theme` escolhe a paleta (styles/index.css) e a classe
 * `dark` liga os estilos escuros (ex.: destaque de código). "Sistema"
 * acompanha o Windows. O tema também fica no localStorage para a próxima
 * abertura já pintar certo antes das configurações carregarem.
 */
export function applyTheme(theme: AppSettings["theme"]): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const root = document.documentElement;
    const def = getTheme(theme, media.matches);
    if (root.dataset.theme === def.id) return;
    // Troca instantânea: sem isso cada elemento "anima" as cores do tema antigo para o novo.
    root.classList.add("theme-switching");
    root.dataset.theme = def.id;
    root.classList.toggle("dark", def.dark);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  };
  apply();
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // sem storage: só perde o "pintar certo" na abertura
  }
  if (theme !== "system") return () => undefined;
  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}

const THEME_KEY = "qrz.theme";

/** Chamado antes do React montar: aplica o último tema usado. */
export function applyStoredTheme(): void {
  try {
    const stored = localStorage.getItem(THEME_KEY) as AppSettings["theme"] | null;
    if (stored) applyTheme(stored);
  } catch {
    // ignora
  }
}
