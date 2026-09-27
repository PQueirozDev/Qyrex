import { useEffect, useState } from "react";
import { RotateCw, Sparkles, X } from "lucide-react";
import type { UpdateStatus } from "@shared/types";
import { CHANGELOG, compareVersions } from "@shared/changelog";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ChangelogRelease } from "@/components/Changelog";
import { tr } from "@/lib/i18n";
import { attempt } from "@/lib/api";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUIStore } from "@/stores/useUIStore";

let lastStatus: UpdateStatus = { state: "idle" };
const subscribers = new Set<(s: UpdateStatus) => void>();
let subscribed = false;

function ensureSubscribed(): void {
  if (subscribed) return;
  subscribed = true;
  void window.workspace.updates.status().then((res) => {
    if (res.ok) publish(res.data);
  });
  window.workspace.updates.onStatus(publish);
}

function publish(status: UpdateStatus): void {
  lastStatus = status;
  subscribers.forEach((fn) => fn(status));
}

/** Estado do atualizador compartilhado entre banner, Novidades e Configurações. */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState(lastStatus);
  useEffect(() => {
    ensureSubscribed();
    subscribers.add(setStatus);
    setStatus(lastStatus);
    return () => {
      subscribers.delete(setStatus);
    };
  }, []);
  return status;
}

const COUNTDOWN = 10;

/**
 * Faixa no topo quando uma atualização foi baixada e verificada. Com
 * "Atualizar automaticamente" ligado, reinicia sozinho após a contagem —
 * o usuário pode adiar (aí instala quando fechar o app).
 */
export function UpdateBanner() {
  const status = useUpdateStatus();
  const autoUpdate = useSettingsStore((s) => s.settings?.autoUpdate ?? false);
  const [postponed, setPostponed] = useState(false);
  const [seconds, setSeconds] = useState(COUNTDOWN);

  const ready = status.state === "downloaded" && !postponed;

  useEffect(() => {
    if (!ready || !autoUpdate) return;
    setSeconds(COUNTDOWN);
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          void attempt(window.workspace.updates.install());
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [ready, autoUpdate]);

  if (!ready || status.state !== "downloaded") return null;

  return (
    <div className="flex animate-fade-in items-center gap-3 border-b border-accent/20 bg-accent/10 px-5 py-2 text-[13px]">
      <Sparkles size={14} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 text-text">
        {autoUpdate
          ? tr("QrzSpace {version} está pronto. Reiniciando para atualizar em {s}s...", { version: status.version, s: seconds })
          : tr("QrzSpace {version} está pronto para instalar.", { version: status.version })}
      </span>
      <Button size="xs" onClick={() => void attempt(window.workspace.updates.install())}>
        <RotateCw size={12} /> {tr("Reiniciar agora")}
      </Button>
      <button
        onClick={() => setPostponed(true)}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-muted hover:bg-bg-hover hover:text-text"
        title={tr("Instala quando você fechar o app")}
      >
        <X size={12} /> {tr("Depois")}
      </button>
    </div>
  );
}

/** Depois de uma atualização, mostra uma vez o que mudou na nova versão. */
export function WhatsNewDialog() {
  const { settings, system, update } = useSettingsStore();
  const navigate = useUIStore((s) => s.navigate);
  const [open, setOpen] = useState(false);

  const current = system?.appVersion;
  const entry = CHANGELOG.find((e) => e.version === current);

  useEffect(() => {
    // Só após atualizar: numa instalação nova (lastSeenVersion nulo) quem avisa é o ponto na sidebar.
    // "Anterior" e não "diferente": a aba Novidades marca a versão mais nova do changelog como lida,
    // e comparar por igualdade fazia os dois ficarem regravando versões um do outro.
    if (settings && current && entry && settings.lastSeenVersion && compareVersions(settings.lastSeenVersion, current) < 0) setOpen(true);
  }, [settings, current, entry]);

  if (!entry) return null;

  const close = () => {
    setOpen(false);
    const seen = settings?.lastSeenVersion;
    if (!seen || compareVersions(seen, entry.version) < 0) void update({ lastSeenVersion: entry.version });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="md"
      title={tr("Novidades do QrzSpace {version}", { version: entry.version })}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              close();
              navigate("novidades");
            }}
          >
            {tr("Ver histórico completo")}
          </Button>
          <Button size="sm" onClick={close}>
            {tr("Entendi")}
          </Button>
        </>
      }
    >
      <ChangelogRelease entry={entry} />
    </Dialog>
  );
}
