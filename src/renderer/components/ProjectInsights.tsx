import { useEffect, useState } from "react";
import type { ProjectInsights } from "@shared/types";
import { cn } from "@/lib/cn";
import { tr, trn } from "@/lib/i18n";

/**
 * Cache do renderer: os cards remontam ao filtrar/trocar de visão e não devem
 * pedir de novo ao main (que também tem cache, de 5 min).
 */
const cache = new Map<string, { at: number; value: ProjectInsights }>();
const inflight = new Map<string, Promise<ProjectInsights | null>>();
const TTL = 60_000;

function fetchInsights(id: string): Promise<ProjectInsights | null> {
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = window.workspace.projects
    .insights(id)
    .then((res) => {
      if (!res.ok) return null;
      cache.set(id, { at: Date.now(), value: res.data });
      return res.data;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

/** Insights de um projeto (null enquanto carrega ou se falhar; falha não vira toast: é só enfeite). */
export function useProjectInsights(id: string, enabled = true): ProjectInsights | null {
  const [value, setValue] = useState<ProjectInsights | null>(() => cache.get(id)?.value ?? null);
  useEffect(() => {
    if (!enabled) return;
    const hit = cache.get(id);
    if (hit) setValue(hit.value);
    if (hit && Date.now() - hit.at < TTL) return;
    let alive = true;
    void fetchInsights(id).then((v) => alive && v && setValue(v));
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return value;
}

const langName = (name: string) => (name === "Outras" ? tr("Outras") : name);

/** Barra fina com a proporção de cada linguagem (como a do GitHub). */
export function LanguageBar({ insights, legend = 3, className }: { insights: ProjectInsights | null; legend?: number; className?: string }) {
  if (!insights) return <div className={cn("skeleton h-1.5 rounded-full", className)} />;
  if (insights.languages.length === 0) return null;
  return (
    <div className={className}>
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full" title={insights.languages.map((l) => `${langName(l.name)} ${l.percent}%`).join(" · ")}>
        {insights.languages.map((l) => (
          <span key={l.name} style={{ width: `${l.percent}%`, background: l.color }} className="min-w-[2px]" />
        ))}
      </div>
      {legend > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
          {insights.languages.slice(0, legend).map((l) => (
            <span key={l.name} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
              {langName(l.name)} <span className="text-text-faint">{Math.round(l.percent)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Colunas de commits por semana (12 semanas). Semana sem commit fica como um traço. */
export function CommitSparkline({ weekly, className }: { weekly: number[] | undefined; className?: string }) {
  if (!weekly) return <div className={cn("skeleton h-5 w-[70px] rounded", className)} />;
  const max = Math.max(1, ...weekly);
  const total = weekly.reduce((a, b) => a + b, 0);
  return (
    <div
      className={cn("flex h-5 items-end gap-[2px]", className)}
      title={trn(total, "{n} commit nas últimas 12 semanas", "{n} commits nas últimas 12 semanas")}
      aria-label={trn(total, "{n} commit nas últimas 12 semanas", "{n} commits nas últimas 12 semanas")}
    >
      {weekly.map((n, i) => (
        <span
          key={i}
          className={cn("w-1 rounded-sm", n > 0 ? "bg-accent" : "bg-border")}
          style={{ height: n > 0 ? `${Math.max(18, (n / max) * 100)}%` : "2px", opacity: n > 0 ? 0.45 + 0.55 * (n / max) : 1 }}
        />
      ))}
    </div>
  );
}
