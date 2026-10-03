import { create } from "zustand";
import type { AppSettings, SystemInfo } from "@shared/types";
import { attempt } from "@/lib/api";
import { getTheme } from "@/lib/themes";
import { tr } from "@/lib/i18n";
import { confirmAction } from "./useUIStore";

type SettingsPatch = Parameters<typeof window.workspace.settings.update>[0];

interface SettingsState {
  settings: AppSettings | null;
  system: SystemInfo | null;
  /** Foto de perfil (data URL) ou null para usar as iniciais. */
  avatar: string | null;
  load: () => Promise<void>;
  loadAvatar: () => Promise<void>;
  /** Abre o seletor de imagens. Devolve true se a foto mudou. */
  pickAvatar: () => Promise<boolean>;
  removeAvatar: () => Promise<void>;
  loadSystem: () => Promise<void>;
  update: (patch: SettingsPatch) => Promise<void>;
  addAllowedDir: (dir?: string) => Promise<boolean>;
  removeAllowedDir: (dir: string) => Promise<void>;
  /** Liga/desliga "Permitir todas as pastas do PC" (ligar pede confirmação). */
  setAllowAllDirs: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  system: null,
  avatar: null,

  load: async () => {
    const data = await attempt(window.workspace.settings.get());
    if (data) set({ settings: data });
  },
  loadAvatar: async () => {
    const data = await attempt(window.workspace.profile.getAvatar());
    set({ avatar: data ?? null });
  },
  pickAvatar: async () => {
    const data = await attempt(window.workspace.profile.pickAvatar());
    if (!data) return false;
    set({ avatar: data });
    return true;
  },
  removeAvatar: async () => {
    // attempt devolve null quando deu certo e undefined quando falhou (já com toast).
    if ((await attempt(window.workspace.profile.removeAvatar())) === null) set({ avatar: null });
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
  setAllowAllDirs: async (enabled) => {
    if (enabled) {
      const ok = await confirmAction({
        title: tr("Permitir todas as pastas do PC?"),
        description: tr("O Qyrex poderá ler, listar e alterar arquivos em qualquer pasta de qualquer unidade, sem precisar autorizar uma por uma."),
        confirmLabel: tr("Permitir tudo"),
        danger: true,
      });
      if (!ok) return;
    }
    const data = await attempt(window.workspace.settings.update({ allowAllDirs: enabled }));
    if (data) set({ settings: data });
    if (enabled && !get().system) await get().loadSystem();
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
    syncTitleBar();
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

function toHex(css: string): string | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}` : null;
}

/** Pinta os botões da janela (minimizar/maximizar/fechar) com as cores do tema. */
function syncTitleBar(): void {
  requestAnimationFrame(() => {
    const styles = getComputedStyle(document.body);
    const color = toHex(styles.backgroundColor);
    const probe = document.createElement("span");
    probe.className = "text-text-muted";
    document.body.appendChild(probe);
    const symbolColor = toHex(getComputedStyle(probe).color);
    probe.remove();
    if (color && symbolColor) void window.workspace?.system.setTitleBarColors({ color, symbolColor });
  });
}

/** Chamado antes do React montar: aplica o último tema usado. */
export function applyStoredTheme(): void {
  try {
    const stored = localStorage.getItem(THEME_KEY) as AppSettings["theme"] | null;
    if (stored) applyTheme(stored);
  } catch {
    // ignora
  }
}
