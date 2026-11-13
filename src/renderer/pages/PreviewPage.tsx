import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { tr } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { useUIStore } from "@/stores/useUIStore";

/** Página Preview: a aplicação local do usuário dentro do Qyrex (ver PreviewPanel / previewService). */
export function PreviewPage() {
  const pageParam = useUIStore((s) => s.pageParam);
  const Icon = PAGE_ICONS.preview;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-subtle px-6 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
          <Icon size={15} />
        </div>
        <div>
          <h1 className="text-base font-semibold leading-tight text-text">{tr("Preview")}</h1>
          <p className="text-[11px] text-text-muted">{tr("Sua aplicação local, isolada do Qyrex: só abre localhost.")}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <PreviewPanel visible projectId={pageParam} />
      </div>
    </div>
  );
}
