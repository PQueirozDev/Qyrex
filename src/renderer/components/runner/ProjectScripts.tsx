import { useEffect, useState } from "react";
import { ExternalLink, Play, Square } from "lucide-react";
import type { ProjectScripts } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { useRunnerStore } from "@/stores/useRunnerStore";
import { useUIStore } from "@/stores/useUIStore";

/** Scripts mais usados primeiro; o resto vem na ordem do package.json. */
const PRIORITY = ["dev", "start", "serve", "watch", "test", "build", "lint", "typecheck"];

/**
 * Seção "Scripts" no drawer do projeto: roda pelo runner (com confirmação) e
 * mostra o que já está rodando, com o endereço local e o botão de encerrar.
 */
export function ProjectScriptsSection({ projectId }: { projectId: string }) {
  const [scripts, setScripts] = useState<ProjectScripts | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { processes, init, runScript, stop, select } = useRunnerStore();
  const navigate = useUIStore((s) => s.navigate);

  useEffect(() => init(), [init]);
  useEffect(() => {
    void attempt(window.workspace.runner.scripts(projectId)).then((s) => setScripts(s ?? null));
  }, [projectId]);

  if (!scripts || scripts.scripts.length === 0) return null;
  const sorted = [...scripts.scripts].sort((a, b) => {
    const pa = PRIORITY.indexOf(a.name);
    const pb = PRIORITY.indexOf(b.name);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  const visible = showAll ? sorted : sorted.slice(0, 5);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="section-title">{tr("Scripts")}</p>
        <span className="font-mono text-[11px] text-text-faint">{scripts.packageManager}</span>
      </div>
      <ul className="space-y-0.5">
        {visible.map((s) => {
          const proc = processes.find((p) => p.projectId === projectId && p.script === s.name && p.status === "running");
          return (
            <li key={s.name} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-bg-hover">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", proc ? "bg-success" : "bg-border")} />
              <button
                className="w-24 shrink-0 truncate text-left font-mono text-[12px] text-text"
                onClick={() => {
                  if (!proc) return;
                  select(proc.id);
                  navigate("processos");
                }}
                title={proc ? tr("Ver a saída") : s.command}
              >
                {s.name}
              </button>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-faint" title={s.command}>
                {s.command}
              </span>
              {proc?.urls[0] && (
                <Button size="icon-sm" variant="ghost" onClick={() => void attempt(window.workspace.system.openExternalUrl(proc.urls[0]))} title={proc.urls[0]} aria-label={tr("Abrir no navegador")}>
                  <ExternalLink size={12} />
                </Button>
              )}
              {proc ? (
                <Button size="icon-sm" variant="ghost" className="text-danger" onClick={() => void stop(proc.id)} title={tr("Encerrar")} aria-label={tr("Encerrar")}>
                  <Square size={11} />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-accent"
                  onClick={() => void runScript(projectId, s.name, s.command, scripts.packageManager)}
                  title={tr("Rodar")}
                  aria-label={tr("Rodar o script {name}?", { name: s.name })}
                >
                  <Play size={12} />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {sorted.length > 5 && (
        <button className="mt-1 px-1.5 text-[11px] text-text-faint hover:text-text" onClick={() => setShowAll(!showAll)}>
          {showAll ? tr("Mostrar menos") : tr("Mostrar todos ({n})", { n: sorted.length })}
        </button>
      )}
    </section>
  );
}
