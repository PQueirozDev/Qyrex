import { create } from "zustand";
import type { ProjectWithGit } from "@shared/types";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { toast } from "@/stores/useUIStore";

type CreateInput = Parameters<typeof window.workspace.projects.create>[0];
type UpdatePatch = Parameters<typeof window.workspace.projects.update>[1];

interface ProjectsState {
  projects: ProjectWithGit[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  create: (input: CreateInput) => Promise<boolean>;
  update: (id: string, patch: UpdatePatch) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<void>;
  open: (project: ProjectWithGit, target: "vscode" | "terminal" | "explorer" | "github") => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  loaded: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ projects: await unwrap(window.workspace.projects.list()), loaded: true });
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },
  create: async (input) => {
    const ok = await attempt(window.workspace.projects.create(input), tr("Projeto adicionado"));
    if (ok) await get().load();
    return Boolean(ok);
  },
  update: async (id, patch) => {
    const ok = await attempt(window.workspace.projects.update(id, patch), tr("Projeto atualizado"));
    if (ok) await get().load();
    return Boolean(ok);
  },
  remove: async (id) => {
    try {
      await unwrap(window.workspace.projects.delete(id));
      toast.success(tr("Projeto excluído"));
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      await get().load();
    }
  },
  toggleFavorite: async (id) => {
    set({ projects: get().projects.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p)) });
    await attempt(window.workspace.projects.toggleFavorite(id));
  },
  open: async (project, target) => {
    const api = window.workspace;
    let result: unknown;
    if (target === "vscode") result = await attempt(api.system.openVSCode(project.localPath));
    else if (target === "terminal") result = await attempt(api.system.openTerminal(project.localPath));
    else if (target === "explorer") result = await attempt(api.system.openExplorer(project.localPath));
    else if (project.githubUrl) result = await attempt(api.system.openExternalUrl(project.githubUrl));
    if (result !== undefined) {
      await api.projects.touchOpened(project.id);
      set({
        projects: get().projects.map((p) => (p.id === project.id ? { ...p, lastOpenedAt: new Date().toISOString() } : p)),
      });
    }
  },
}));
