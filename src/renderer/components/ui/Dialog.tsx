import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  danger?: boolean;
  /** Impede fechar clicando fora (ex.: formulários com dados). */
  dismissable?: boolean;
}

const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export function Dialog({ open, onClose, title, description, children, footer, size = "md", danger, dismissable = true }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    // Foca o primeiro campo do diálogo para permitir uso só com teclado.
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("input, textarea, select, [data-autofocus]");
      first?.focus();
    }, 20);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-black/50 px-4 pt-[10vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          "mb-10 w-full animate-pop-in rounded-card border bg-bg-elevated shadow-pop",
          danger ? "border-danger/40" : "border-border",
          sizes[size]
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {danger && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-danger">{tr("⚠️ Ação sensível")}</div>}
            <h2 className="text-[15px] font-semibold text-text">{title}</h2>
            {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-text-faint hover:bg-bg-hover hover:text-text" aria-label={tr("Fechar")}>
            <X size={15} />
          </button>
        </div>
        {children && <div className="px-5 py-3">{children}</div>}
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
