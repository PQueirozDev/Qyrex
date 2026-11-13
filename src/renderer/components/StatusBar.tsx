import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, Music2, Pause, Play } from "lucide-react";
import type { LocalMediaState } from "@shared/types";
import { AILimitsIndicator } from "@/components/AILimits";
import { ProjectIcon } from "@/components/ui/primitives";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useUIStore } from "@/stores/useUIStore";
import { tr, trn } from "@/lib/i18n";
import { RunnerStatus } from "@/components/runner/RunnerStatus";

/** Música tocando no PC, numa linha (só com a barra lateral recolhida, onde o mini player some). */
function NowPlaying() {
  const [media, setMedia] = useState<LocalMediaState | null>(null);
  useEffect(() => {
    const read = async () => {
      const res = await window.workspace.media.state();
      if (res.ok) setMedia(res.data);
    };
    void read();
    const t = setInterval(() => document.visibilityState === "visible" && void read(), 4000);
    return () => clearInterval(t);
  }, []);
  if (!media?.title) return null;
  const toggle = async () => {
    const res = await window.workspace.media.control(media.isPlaying ? "pause" : "play");
    if (res.ok) setMedia({ ...media, isPlaying: !media.isPlaying });
  };
  return (
    <button onClick={() => void toggle()} className="status-item max-w-[260px]" title={media.isPlaying ? tr("Pausar") : tr("Tocar")}>
      {media.isPlaying ? <Pause size={11} /> : <Play size={11} />}
      <Music2 size={11} className="text-accent" />
      <span className="truncate">
        {media.title}
        {media.artist && <span className="text-text-faint"> · {media.artist}</span>}
      </span>
    </button>
  );
}

/**
 * Barra de status no rodapé, no estilo dos editores: o projeto em que você está
 * (branch, commits a enviar/receber, alterações), processos rodando, limites da IA
 * e memória. Tudo clicável leva para o lugar certo.
 */
export function StatusBar() {
  const navigate = useUIStore((s) => s.navigate);
  const page = useUIStore((s) => s.page);
  const pageParam = useUIStore((s) => s.pageParam);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const projects = useProjectsStore((s) => s.projects);
  const loaded = useProjectsStore((s) => s.loaded);
  const load = useProjectsStore((s) => s.load);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // O projeto "atual": o aberto na tela (Projetos/Terminal/Automações com id) ou o último aberto.
  const project = useMemo(() => {
    const active = projects.filter((p) => !p.archivedAt);
    const fromPage = pageParam && ["projetos", "terminal", "automacoes"].includes(page) ? active.find((p) => p.id === pageParam) : undefined;
    return fromPage ?? [...active].filter((p) => p.lastOpenedAt).sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0] ?? null;
  }, [projects, page, pageParam]);
  const git = project?.git;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-1 border-t border-border-subtle bg-bg-elevated px-2 text-[11px] text-text-muted">
      {project && (
        <button className="status-item min-w-0" onClick={() => navigate("projetos", project.id)} title={project.localPath}>
          <ProjectIcon name={project.name} icon={project.icon} size={14} className="rounded-[4px] text-[7px]" />
          <span className="truncate font-medium text-text">{project.name}</span>
        </button>
      )}
      {git?.isRepo && (
        <button className="status-item" onClick={() => project && navigate("projetos", project.id)} title={tr("Git")}>
          <GitBranch size={12} />
          <span className="font-mono">{git.branch ?? "?"}</span>
          {git.ahead > 0 && (
            <span className="flex items-center text-accent" title={trn(git.ahead, "{n} commit para enviar", "{n} commits para enviar")}>
              <ArrowUp size={11} />
              {git.ahead}
            </span>
          )}
          {git.behind > 0 && (
            <span className="flex items-center text-warning" title={trn(git.behind, "{n} commit para receber", "{n} commits para receber")}>
              <ArrowDown size={11} />
              {git.behind}
            </span>
          )}
          {git.modifiedCount > 0 && (
            <span className="text-warning" title={trn(git.modifiedCount, "{n} alteração", "{n} alterações")}>
              ●{git.modifiedCount}
            </span>
          )}
        </button>
      )}
      <RunnerStatus />

      <div className="ml-auto flex min-w-0 items-center gap-1">
        {collapsed && <NowPlaying />}
        <AILimitsIndicator compact />
      </div>
    </footer>
  );
}
