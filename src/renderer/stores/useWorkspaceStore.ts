import { create } from "zustand";
import {
  closePanel,
  movePanel,
  openPanel,
  preset,
  resizeSplit,
  sanitize,
  setActive,
  splitGroup,
  type Edge,
  type LayoutNode,
  type PanelId,
  type PresetId,
} from "@/lib/workspaceLayout";

/**
 * Workspace por projeto: quais projetos estão abertos em abas, qual está ativo e
 * o layout de cada um. Tudo fica no localStorage (preferência visual deste PC):
 * fechar e abrir o app restaura a última sessão.
 */

const SESSION_KEY = "qrz.ws.session";
const layoutKey = (projectId: string) => `qrz.ws.layout.${projectId}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sem storage: vale só nesta sessão
  }
}

interface Session {
  open: string[];
  active: string | null;
}

interface WorkspaceState {
  open: string[];
  active: string | null;
  layouts: Record<string, LayoutNode | null>;
  /** Grupo maximizado por projeto (temporário: não é salvo). */
  maximized: Record<string, string | null>;
  openProject: (projectId: string) => void;
  closeProject: (projectId: string) => void;
  setActiveProject: (projectId: string) => void;
  /** Remove da sessão projetos que não existem mais (excluídos ou arquivados). */
  prune: (validIds: string[]) => void;
  layoutOf: (projectId: string) => LayoutNode | null;
  applyPreset: (projectId: string, id: PresetId) => void;
  activate: (projectId: string, groupId: string, panel: PanelId) => void;
  openPanel: (projectId: string, panel: PanelId, groupId?: string) => void;
  close: (projectId: string, panel: PanelId) => void;
  move: (projectId: string, panel: PanelId, targetGroupId: string, edge: Edge) => void;
  split: (projectId: string, groupId: string, dir: "row" | "col") => void;
  resize: (projectId: string, splitId: string, sizes: number[]) => void;
  toggleMaximize: (projectId: string, groupId: string) => void;
}

const session = read<Session>(SESSION_KEY) ?? { open: [], active: null };

function loadLayout(projectId: string): LayoutNode {
  return sanitize(read(layoutKey(projectId))) ?? preset("dev");
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const saveSession = () => write(SESSION_KEY, { open: get().open, active: get().active });
  const update = (projectId: string, fn: (layout: LayoutNode | null) => LayoutNode | null) => {
    const next = fn(get().layoutOf(projectId));
    set({ layouts: { ...get().layouts, [projectId]: next } });
    write(layoutKey(projectId), next);
  };
  return {
    open: Array.isArray(session.open) ? session.open.filter((x) => typeof x === "string") : [],
    active: typeof session.active === "string" ? session.active : null,
    layouts: {},
    maximized: {},

    openProject: (projectId) => {
      const open = get().open.includes(projectId) ? get().open : [...get().open, projectId];
      set({ open, active: projectId });
      saveSession();
    },
    closeProject: (projectId) => {
      const open = get().open.filter((id) => id !== projectId);
      const idx = get().open.indexOf(projectId);
      const active = get().active === projectId ? open[Math.max(0, idx - 1)] ?? null : get().active;
      set({ open, active });
      saveSession();
    },
    setActiveProject: (projectId) => {
      set({ active: projectId });
      saveSession();
    },
    prune: (validIds) => {
      const open = get().open.filter((id) => validIds.includes(id));
      if (open.length === get().open.length) return;
      set({ open, active: get().active && open.includes(get().active!) ? get().active : open[0] ?? null });
      saveSession();
    },
    // Puro (pode ser chamado durante o render): o cache só é preenchido nas ações.
    layoutOf: (projectId) => {
      const cached = get().layouts[projectId];
      return cached !== undefined ? cached : loadLayout(projectId);
    },
    applyPreset: (projectId, id) => {
      set({ maximized: { ...get().maximized, [projectId]: null } });
      update(projectId, () => preset(id));
    },
    activate: (projectId, groupId, panel) => update(projectId, (l) => (l ? setActive(l, groupId, panel) : l)),
    openPanel: (projectId, panel, groupId) => update(projectId, (l) => openPanel(l, panel, groupId)),
    close: (projectId, panel) => update(projectId, (l) => (l ? closePanel(l, panel) : l)),
    move: (projectId, panel, targetGroupId, edge) => update(projectId, (l) => (l ? movePanel(l, panel, targetGroupId, edge) : l)),
    split: (projectId, groupId, dir) => update(projectId, (l) => (l ? splitGroup(l, groupId, dir) : l)),
    resize: (projectId, splitId, sizes) => update(projectId, (l) => (l ? resizeSplit(l, splitId, sizes) : l)),
    toggleMaximize: (projectId, groupId) =>
      set({ maximized: { ...get().maximized, [projectId]: get().maximized[projectId] === groupId ? null : groupId } }),
  };
});
