import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useUIStore } from "@/stores/useUIStore";
import { tr } from "@/lib/i18n";

/** Notificações em pílula no canto inferior direito, com entrada e saída em mola. */
export function Toaster() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[340px] flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? XCircle : Info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.9, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)", transition: { duration: 0.16 } }}
              transition={{ type: "spring", stiffness: 480, damping: 32 }}
              className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-[#0b0b0d] py-1.5 pl-1.5 pr-3 text-white shadow-[0_12px_32px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/10"
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  t.kind === "success" ? "bg-success text-black" : t.kind === "error" ? "bg-danger text-white" : "bg-accent text-accent-fg"
                )}
              >
                <Icon size={15} />
              </span>
              <p className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="press rounded-full p-0.5 text-white/50 hover:text-white" aria-label={tr("Fechar")}>
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
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
