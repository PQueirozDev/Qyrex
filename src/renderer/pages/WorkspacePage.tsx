import { useEffect, useMemo, useState } from "react";
import { Bug, Code2, GitBranch, LayoutTemplate, Plus, Target, X } from "lucide-react";
import type { ProjectWithGit } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { EmptyState, Menu, ProjectIcon } from "@/components/ui/primitives";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { tr } from "@/lib/i18n";
import type { PresetId } from "@/lib/workspaceLayout";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useUIStore } from "@/stores/useUIStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

const PRESETS: { id: PresetId; label: string; hint: string; icon: typeof Code2 }[] = [
  { id: "dev", label: tr("Desenvolvimento"), hint: tr("Arquivos, preview e terminal"), icon: Code2 },
  { id: "debug", label: tr("Debug"), hint: tr("Terminal, processos e monitor"), icon: Bug },
  { id: "git", label: tr("Git"), hint: tr("Alterações, arquivos e terminal"), icon: GitBranch },
  { id: "focus", label: tr("Foco"), hint: tr("Um painel só, sem distrações"), icon: Target },
];

/** O layout de um projeto aberto. Fica montado (escondido) depois da primeira visita: o terminal não morre ao trocar de aba. */
function ProjectWorkspace({ project, visible }: { project: ProjectWithGit; visible: boolean }) {
  const stored = useWorkspaceStore((s) => s.layouts[project.id]);
  const layoutOf = useWorkspaceStore((s) => s.layoutOf);
  const applyPreset = useWorkspaceStore((s) => s.applyPreset);
  const layout = stored !== undefined ? stored : layoutOf(project.id);
  if (!layout) {
    return (
      <div className={cn("flex-1 items-center justify-center", visible ? "flex" : "hidden")}>
        <EmptyState
          mascot
          title={tr("Todos os painéis fechados")}
          description={tr("Escolha um layout para recomeçar.")}
          action={
            <div className="flex flex-wrap justify-center gap-1.5">
              {PRESETS.map((p) => (
                <Button key={p.id} size="sm" variant="secondary" onClick={() => applyPreset(project.id, p.id)}>
                  <p.icon size={12} /> {p.label}
                </Button>
              ))}
            </div>
          }
        />
      </div>
    );
  }
  return (
    <div className={cn("min-h-0 flex-1 flex-col", visible ? "flex" : "hidden")}>
      <WorkspaceLayout layout={layout} project={project} visible={visible} />
    </div>
  );
}

/**
 * Workspace: cada projeto aberto em uma aba, com painéis (arquivos, terminal, Git,
 * preview, IA, tarefas, notas, processos, monitor) organizáveis e salvos por projeto.
 * `visible`: a página fica montada escondida quando o usuário está em outra área.
 */
export function WorkspacePage({ visible = true }: { visible?: boolean }) {
  const { projects, loaded, load } = useProjectsStore();
  const pageParam = useUIStore((s) => s.pageParam);
  const { open, active, openProject, closeProject, setActiveProject, applyPreset, prune } = useWorkspaceStore();
  const [mounted, setMounted] = useState<string[]>([]);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const usable = useMemo(() => projects.filter((p) => !p.archivedAt), [projects]);
  useEffect(() => {
    if (loaded) prune(usable.map((p) => p.id));
  }, [loaded, usable, prune]);

  // navigate("workspace", id) abre (ou foca) o projeto.
  useEffect(() => {
    if (pageParam && usable.some((p) => p.id === pageParam)) openProject(pageParam);
  }, [pageParam, usable, openProject]);

  useEffect(() => {
    if (active && !mounted.includes(active)) setMounted((m) => [...m, active]);
  }, [active, mounted]);
  // Fechar a aba desmonta o projeto (encerra o terminal dele).
  useEffect(() => {
    setMounted((m) => m.filter((id) => open.includes(id)));
  }, [open]);

  const openProjects = open.map((id) => usable.find((p) => p.id === id)).filter((p): p is ProjectWithGit => Boolean(p));
  const notOpen = usable.filter((p) => !open.includes(p.id)).sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""));

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-subtle px-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" role="tablist" aria-label={tr("Projetos abertos")}>
          {openProjects.map((p) => (
            <div
              key={p.id}
              role="tab"
              tabIndex={0}
              aria-selected={p.id === active}
              onClick={() => setActiveProject(p.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveProject(p.id)}
              onAuxClick={(e) => e.button === 1 && closeProject(p.id)}
              className={cn(
                "group flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[12.5px] transition-colors",
                p.id === active ? "bg-bg-hover text-text" : "text-text-muted hover:bg-bg-hover/50 hover:text-text"
              )}
            >
              <ProjectIcon name={p.name} icon={p.icon} size={16} className="rounded-[4px] text-[8px]" />
              <span className="max-w-[160px] truncate">{p.name}</span>
              {p.git?.branch && <span className="font-mono text-[10.5px] text-text-faint">{p.git.branch}</span>}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeProject(p.id);
                }}
                className="rounded p-px text-text-faint opacity-0 hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={tr("Fechar {name}", { name: p.name })}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {notOpen.length > 0 && (
            <Menu
              align="left"
              label={tr("Abrir projeto no Workspace")}
              trigger={<Plus size={14} />}
              items={notOpen.slice(0, 12).map((p) => ({ label: p.name, icon: Code2, onSelect: () => openProject(p.id) }))}
            />
          )}
        </div>
        {active && (
          <Menu
            label={tr("Layouts")}
            trigger={
              <span className="flex items-center gap-1 text-xs">
                <LayoutTemplate size={13} /> {tr("Layout")}
              </span>
            }
            items={PRESETS.map((p) => ({ label: `${p.label} · ${p.hint}`, icon: p.icon, onSelect: () => applyPreset(active, p.id) }))}
          />
        )}
      </div>

      {openProjects.length === 0 ? (
        <div className="flex flex-1 items-center justify-center overflow-auto p-6">
          <div className="w-full max-w-md">
            <EmptyState
              mascot
              title={tr("Abra um projeto no Workspace")}
              description={tr("Arquivos, terminal, Git, preview, tarefas e notas do projeto lado a lado. O layout de cada projeto fica salvo.")}
              className="py-4"
            />
            {notOpen.length === 0 ? (
              <p className="text-center text-sm text-text-faint">{tr("Adicione um projeto em Projetos primeiro.")}</p>
            ) : (
              <ul className="space-y-0.5">
                {notOpen.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <button onClick={() => openProject(p.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-bg-hover">
                      <ProjectIcon name={p.name} icon={p.icon} size={24} className="rounded-md" />
                      <span className="min-w-0 flex-1 truncate text-sm text-text">{p.name}</span>
                      <span className="text-[11px] text-text-faint">{p.lastOpenedAt ? timeAgo(p.lastOpenedAt) : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        openProjects
          .filter((p) => mounted.includes(p.id))
          .map((p) => <ProjectWorkspace key={p.id} project={p} visible={visible && p.id === active} />)
      )}
    </div>
  );
}
