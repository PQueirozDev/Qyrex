import { create } from "zustand";
import { readShortcuts, writeShortcuts, type ShortcutMap } from "@/lib/shortcuts";

/** Registro da central de notificações (tudo o que apareceu como aviso na sessão). */
export interface NotificationEntry {
  id: number;
  kind: Toast["kind"];
  message: string;
  at: number;
  read: boolean;
}

export type Page =
  | "inicio"
  | "ia"
  | "projetos"
  | "terminal"
  | "automacoes"
  | "processos"
  | "plugins"
  | "workspace"
  | "preview"
  | "ferramentas"
  | "arquivos"
  | "editor"
  | "agenda"
  | "tarefas"
  | "notion"
  | "integracoes"
  | "novidades"
  | "configuracoes";

export const PAGES: Page[] = [
  "inicio",
  "ia",
  "projetos",
  "terminal",
  "automacoes",
  "processos",
  "plugins",
  "workspace",
  "preview",
  "ferramentas",
  "arquivos",
  "editor",
  "agenda",
  "tarefas",
  "notion",
  "integracoes",
  "novidades",
  "configuracoes",
];

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Texto destacado em bloco monoespaçado (ex.: comando ou caminho). */
  detail?: string;
  danger?: boolean;
  confirmLabel?: string;
}

export interface PromptOptions {
  title: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface Pending<T, O> {
  options: O;
  resolve: (value: T) => void;
}

interface UIState {
  page: Page;
  /** Parâmetro opcional de navegação (ex.: id do projeto a destacar). */
  pageParam: string | null;
  paletteOpen: boolean;
  quickTaskOpen: boolean;
  online: boolean;
  toasts: Toast[];
  confirmState: Pending<boolean, ConfirmOptions> | null;
  promptState: Pending<string | null, PromptOptions> | null;
  /** Modo "só terminais": na página Terminal, esconde a barra lateral e o cabeçalho. */
  terminalOnly: boolean;
  /** Barra lateral recolhida (só ícones). */
  sidebarCollapsed: boolean;
  /** Modo compacto: menos espaço entre tudo (classe `compact` no <html>). */
  compact: boolean;
  shortcuts: ShortcutMap;
  notifications: NotificationEntry[];

  navigate: (page: Page, param?: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setQuickTaskOpen: (open: boolean) => void;
  setOnline: (online: boolean) => void;
  setTerminalOnly: (on: boolean) => void;
  setSidebarCollapsed: (on: boolean) => void;
  setCompact: (on: boolean) => void;
  setShortcuts: (map: ShortcutMap) => void;
  markNotificationsRead: () => void;
  clearNotifications: () => void;
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

const TERMINAL_ONLY_KEY = "qrz.terminalOnly";
const SIDEBAR_KEY = "qrz.sidebarCollapsed";
const COMPACT_KEY = "qrz.compact";

/** Preferências pequenas de layout ficam no localStorage (sem storage: valem só nesta sessão). */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // sem storage: vale só nesta sessão
  }
}

export const useUIStore = create<UIState>((set, get) => ({
  page: "inicio",
  pageParam: null,
  paletteOpen: false,
  quickTaskOpen: false,
  online: navigator.onLine,
  toasts: [],
  confirmState: null,
  promptState: null,
  terminalOnly: readFlag(TERMINAL_ONLY_KEY),
  sidebarCollapsed: readFlag(SIDEBAR_KEY),
  compact: readFlag(COMPACT_KEY),
  shortcuts: readShortcuts(),
  notifications: [],

  navigate: (page, param = null) => set({ page, pageParam: param }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setQuickTaskOpen: (open) => set({ quickTaskOpen: open }),
  setOnline: (online) => set({ online }),
  setTerminalOnly: (on) => {
    writeFlag(TERMINAL_ONLY_KEY, on);
    set({ terminalOnly: on });
  },
  setSidebarCollapsed: (on) => {
    writeFlag(SIDEBAR_KEY, on);
    set({ sidebarCollapsed: on });
  },
  setCompact: (on) => {
    writeFlag(COMPACT_KEY, on);
    set({ compact: on });
  },
  setShortcuts: (map) => {
    writeShortcuts(map);
    set({ shortcuts: map });
  },
  markNotificationsRead: () => set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
  clearNotifications: () => set({ notifications: [] }),
  pushToast: (kind, message) => {
    const id = ++toastId;
    set({
      toasts: [...get().toasts.slice(-3), { id, kind, message }],
      // Tudo o que vira aviso fica na central (as 60 mais recentes), para rever depois.
      notifications: [{ id, kind, message, at: Date.now(), read: false }, ...get().notifications].slice(0, 60),
    });
    setTimeout(() => get().dismissToast(id), kind === "error" ? 6000 : 3000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string) => useUIStore.getState().pushToast("success", message),
  error: (message: string) => useUIStore.getState().pushToast("error", message),
  info: (message: string) => useUIStore.getState().pushToast("info", message),
};

/** Substitui window.confirm (que não existe de forma utilizável no Electron). */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useUIStore.setState({
      confirmState: {
        options,
        resolve: (value) => {
          useUIStore.setState({ confirmState: null });
          resolve(value);
        },
      },
    });
  });
}

/** Substitui window.prompt (não suportado pelo Electron). */
export function promptText(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    useUIStore.setState({
      promptState: {
        options,
        resolve: (value) => {
          useUIStore.setState({ promptState: null });
          resolve(value);
        },
      },
    });
  });
}
