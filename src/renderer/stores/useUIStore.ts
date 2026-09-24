import { create } from "zustand";

export type Page =
  | "inicio"
  | "ia"
  | "projetos"
  | "terminal"
  | "arquivos"
  | "agenda"
  | "tarefas"
  | "clientes"
  | "marketing"
  | "whatsapp"
  | "integracoes"
  | "configuracoes";

export const PAGES: Page[] = [
  "inicio",
  "ia",
  "projetos",
  "terminal",
  "arquivos",
  "agenda",
  "tarefas",
  "clientes",
  "marketing",
  "whatsapp",
  "integracoes",
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

  navigate: (page: Page, param?: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setQuickTaskOpen: (open: boolean) => void;
  setOnline: (online: boolean) => void;
  pushToast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const useUIStore = create<UIState>((set, get) => ({
  page: "inicio",
  pageParam: null,
  paletteOpen: false,
  quickTaskOpen: false,
  online: navigator.onLine,
  toasts: [],
  confirmState: null,
  promptState: null,

  navigate: (page, param = null) => set({ page, pageParam: param }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setQuickTaskOpen: (open) => set({ quickTaskOpen: open }),
  setOnline: (online) => set({ online }),
  pushToast: (kind, message) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-3), { id, kind, message }] });
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
