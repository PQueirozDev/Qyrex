import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/stores/useUIStore";
import { tr } from "@/lib/i18n";

/** Notificações discretas no canto inferior direito. */
export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? XCircle : Info;
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-pop-in items-start gap-2.5 rounded-lg border border-border bg-bg-elevated px-3 py-2.5 shadow-pop"
          >
            <Icon
              size={15}
              className={cn(
                "mt-0.5 shrink-0",
                t.kind === "success" ? "text-success" : t.kind === "error" ? "text-danger" : "text-accent"
              )}
            />
            <p className="min-w-0 flex-1 break-words text-[13px] text-text">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-text-faint hover:text-text" aria-label={tr("Fechar")}>
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

/** Diálogo de confirmação global (ver `confirmAction`). */
export function ConfirmHost() {
  const state = useUIStore((s) => s.confirmState);
  if (!state) return null;
  const { options, resolve } = state;
  return (
    <Dialog
      open
      size="sm"
      danger={options.danger}
      onClose={() => resolve(false)}
      title={options.title}
      description={options.description}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => resolve(false)}>{tr("Cancelar")}</Button>
          <Button variant={options.danger ? "danger" : "default"} size="sm" onClick={() => resolve(true)} data-autofocus>
            {options.confirmLabel ?? tr("Confirmar")}
          </Button>
        </>
      }
    >
      {options.detail && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border-subtle bg-bg px-3 py-2 font-mono text-xs text-text">
          {options.detail}
        </pre>
      )}
    </Dialog>
  );
}

/** Substituto de window.prompt (ver `promptText`). */
export function PromptHost() {
  const state = useUIStore((s) => s.promptState);
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(state?.options.initialValue ?? "");
  }, [state]);

  if (!state) return null;
  const { options, resolve } = state;
  const submit = () => value.trim() && resolve(value.trim());

  return (
    <Dialog
      open
      size="sm"
      onClose={() => resolve(null)}
      title={options.title}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => resolve(null)}>{tr("Cancelar")}</Button>
          <Button size="sm" onClick={submit} disabled={!value.trim()}>
            {options.confirmLabel ?? tr("OK")}
          </Button>
        </>
      }
    >
      {options.label && <span className="label">{options.label}</span>}
      <input
        className="input"
        value={value}
        placeholder={options.placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onFocus={(e) => {
          // Seleciona o nome sem a extensão (como o Explorer faz ao renomear).
          const dot = e.target.value.lastIndexOf(".");
          e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
        }}
      />
    </Dialog>
  );
}
