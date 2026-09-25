import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-bg-hover text-text-muted border-border-subtle",
    accent: "bg-accent/10 text-accent border-accent/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/25",
    danger: "bg-danger/10 text-danger border-danger/20",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-bg px-1.5 py-px font-sans text-[10px] font-medium text-text-faint">{children}</kbd>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={cn("animate-spin text-text-faint", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-bg-elevated">
        <Icon size={18} className="text-text-faint" />
      </div>
      <p className="text-sm font-medium text-text">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
      <span className="min-w-0 break-words">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">{tr("Tentar de novo")}</button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-bg-hover" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border-subtle bg-bg-elevated p-0.5", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === opt.value ? "bg-bg-card text-text shadow-sm ring-1 ring-border-subtle" : "text-text-muted hover:text-text"
          )}
        >
          {opt.label}
          {opt.count !== undefined && opt.count > 0 && <span className="text-[10px] text-text-faint">{opt.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-accent" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-text-faint">{hint}</span>}
    </label>
  );
}

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Menu suspenso simples (ações de linha, "mais opções"). */
export function Menu({ trigger, items, align = "right" }: { trigger: ReactNode; items: (MenuItem | "separator")[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const rect = btnRef.current!.getBoundingClientRect();
          const width = 200;
          const left = align === "right" ? rect.right - width : rect.left;
          const estimatedHeight = items.length * 30 + 8;
          const top = rect.bottom + estimatedHeight > window.innerHeight ? rect.top - estimatedHeight - 4 : rect.bottom + 4;
          setPos({ top, left: Math.max(8, left) });
          setOpen((v) => !v);
        }}
        className="rounded-md p-1 text-text-faint transition-colors hover:bg-bg-hover hover:text-text"
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed z-[60] w-[200px] animate-pop-in rounded-lg border border-border bg-bg-elevated p-1 shadow-pop"
            style={{ top: pos.top, left: pos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {items.map((item, i) =>
              item === "separator" ? (
                <div key={i} className="my-1 h-px bg-border-subtle" />
              ) : (
                <button
                  key={item.label}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40",
                    item.danger ? "text-danger hover:bg-danger/10" : "text-text hover:bg-bg-hover"
                  )}
                >
                  {item.icon && <item.icon size={14} className={item.danger ? "" : "text-text-faint"} />}
                  {item.label}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}

/** Painel lateral deslizante para detalhes (projeto, cliente...). */
export function Drawer({
  open,
  onClose,
  title,
  children,
  actions,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        data-drawer
        aria-modal="true"
        className="flex h-full max-w-[92vw] animate-slide-in flex-col border-l border-border bg-bg-elevated shadow-pop"
        style={{ width }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-5 py-3.5">
          <div className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">{title}</div>
          <div className="flex items-center gap-1">{actions}</div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>,
    document.body
  );
}
