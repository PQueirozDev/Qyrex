import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCircle2, Info, Trash2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { useUIStore } from "@/stores/useUIStore";

const ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
const TONE = { success: "text-success", error: "text-danger", info: "text-text-faint" } as const;

function ago(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 60) return tr("agora");
  const m = Math.floor(s / 60);
  return m < 60 ? tr("há {n} min", { n: m }) : tr("há {n} h", { n: Math.floor(m / 60) });
}

/**
 * Central de notificações: tudo o que apareceu como aviso nesta sessão (sucessos,
 * erros, informações), na ordem, para rever o que aconteceu. Serve também de
 * histórico de ações ("Projeto atualizado", "Porta liberada"...).
 */
export function NotificationCenter() {
  const { notifications, markNotificationsRead, clearNotifications } = useUIStore();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-notification-panel]") && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    if (!open) markNotificationsRead();
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="relative rounded-lg p-1.5 text-text-faint transition-colors hover:bg-bg-hover hover:text-text"
        aria-label={tr("Notificações")}
        title={tr("Notificações")}
        aria-expanded={open}
      >
        <Bell size={15} />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-[14px] rounded-full bg-accent px-1 text-[9px] font-semibold leading-[14px] text-accent-fg">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open &&
        createPortal(
          <div
            data-overlay
            data-notification-panel
            role="dialog"
            aria-label={tr("Notificações")}
            className="fixed z-[60] w-[340px] animate-pop-in overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-pop"
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
              <span className="text-[13px] font-medium text-text">{tr("Notificações")}</span>
              {notifications.length > 0 && (
                <button onClick={clearNotifications} className="flex items-center gap-1 text-[11px] text-text-faint hover:text-text">
                  <Trash2 size={11} /> {tr("Limpar")}
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {notifications.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-text-faint">{tr("Nada por aqui ainda. Os avisos desta sessão aparecem aqui.")}</li>
              ) : (
                notifications.map((n) => {
                  const Icon = ICON[n.kind];
                  return (
                    <li key={n.id} className="flex items-start gap-2 px-3 py-1.5">
                      <Icon size={13} className={cn("mt-0.5 shrink-0", TONE[n.kind])} />
                      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-text">{n.message}</span>
                      <span className="shrink-0 text-[10.5px] text-text-faint">{ago(n.at)}</span>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
