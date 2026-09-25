import { Bug, ShieldCheck, Sparkles, Wand2, type LucideIcon } from "lucide-react";
import type { ChangelogEntry } from "@shared/changelog";
import { cn } from "@/lib/cn";
import { getLanguage, getLocale, tr } from "@/lib/i18n";
import { parseLocalDate } from "@/lib/format";

const KIND: Record<ChangelogEntry["sections"][number]["kind"], { label: string; icon: LucideIcon; tone: string }> = {
  new: { label: tr("Novo"), icon: Sparkles, tone: "text-accent bg-accent/10" },
  improved: { label: tr("Melhorado"), icon: Wand2, tone: "text-success bg-success/10" },
  fixed: { label: tr("Corrigido"), icon: Bug, tone: "text-warning bg-warning/10" },
  security: { label: tr("Segurança"), icon: ShieldCheck, tone: "text-text-muted bg-bg-hover" },
};

/** Uma versão do changelog: título, data e listas por tipo de mudança. */
export function ChangelogRelease({ entry, current, compact }: { entry: ChangelogEntry; current?: boolean; compact?: boolean }) {
  const lang = getLanguage();
  return (
    <article>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold text-accent">v{entry.version}</span>
        {current && <span className="rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">{tr("Versão atual")}</span>}
        <span className="text-xs text-text-faint">
          {parseLocalDate(entry.date).toLocaleDateString(getLocale(), { day: "numeric", month: "long", year: "numeric" })}
        </span>
      </header>
      {!compact && <h3 className="mb-3 text-base font-semibold tracking-tight text-text">{entry.title[lang]}</h3>}
      <div className="space-y-3">
        {entry.sections.map((section) => {
          const kind = KIND[section.kind];
          return (
            <div key={section.kind}>
              <span className={cn("mb-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", kind.tone)}>
                <kind.icon size={11} /> {kind.label}
              </span>
              <ul className="space-y-1.5 pl-1">
                {section.items.map((item) => (
                  <li key={item.pt} className="flex gap-2 text-[13px] leading-relaxed text-text-muted">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-text-faint" />
                    <span>{item[lang]}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </article>
  );
}
