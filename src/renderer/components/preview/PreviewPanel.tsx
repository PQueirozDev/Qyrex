import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Copy,
  ExternalLink,
  Globe,
  Monitor,
  Play,
  RefreshCw,
  RotateCw,
  Smartphone,
  Tablet,
  Terminal as TerminalIcon,
  Trash2,
  X,
} from "lucide-react";
import type { PreviewConsoleEntry, PreviewState, RunnerProcess } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, ProjectIcon } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { tr, trn } from "@/lib/i18n";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useRunnerStore } from "@/stores/useRunnerStore";
import { toast, useUIStore } from "@/stores/useUIStore";

type Device = "auto" | "desktop" | "tablet" | "phone" | "custom";
const DEVICE_SIZE: Record<Exclude<Device, "auto" | "custom">, [number, number]> = {
  desktop: [1440, 900],
  tablet: [820, 1180],
  phone: [390, 844],
};
const ZOOMS = ["fit", "0.5", "0.75", "1", "1.25", "1.5"] as const;
type Zoom = (typeof ZOOMS)[number];

const PREFS_KEY = "qrz.preview";
interface Prefs {
  device: Device;
  custom: [number, number];
  rotated: boolean;
  zoom: Zoom;
  lastUrl: string | null;
}
function readPrefs(): Prefs {
  const base: Prefs = { device: "auto", custom: [1024, 768], rotated: false, zoom: "fit", lastUrl: null };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return base;
  }
}
function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // sem storage: vale só nesta sessão
  }
}

const isLocal = (raw: string) => {
  try {
    const u = new URL(raw);
    return (u.protocol === "http:" || u.protocol === "https:") && /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost)$/i.test(u.hostname);
  } catch {
    return false;
  }
};

/** Algum diálogo, menu, drawer ou a paleta está aberto: a view nativa ficaria por cima dele. */
const overlayOpen = () => Boolean(document.querySelector('[role="dialog"], [data-overlay]'));

/**
 * Área nativa do preview: mede onde o "palco" está na janela e manda o main
 * desenhar a página ali. Some (null) quando a área some, a aba esconde ou um overlay abre.
 */
function PreviewStage({ visible, size, zoom }: { visible: boolean; size: [number, number] | null; zoom: Zoom }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escala do aparelho para caber no palco; o zoom da página compensa para manter a largura lógica.
  const { frameW, frameH, factor } = useMemo(() => {
    const userZoom = zoom === "fit" ? null : Number(zoom);
    if (!size) return { frameW: stage.w, frameH: stage.h, factor: userZoom ?? 1 };
    const fit = Math.min(1, (stage.w - 24) / size[0], (stage.h - 24) / size[1]);
    const scale = Math.max(0.1, userZoom === null ? fit : Math.min(userZoom, fit));
    return { frameW: Math.round(size[0] * scale), frameH: Math.round(size[1] * scale), factor: scale };
  }, [size, stage, zoom]);

  useEffect(() => {
    void window.workspace.preview.setZoom(factor);
  }, [factor]);

  // Acompanha a posição (a barra lateral recolher move o palco sem mudar o tamanho).
  useEffect(() => {
    let last = "";
    let raf = 0;
    const tick = () => {
      const frame = frameRef.current;
      let bounds: { x: number; y: number; width: number; height: number } | null = null;
      if (visible && frame && document.visibilityState === "visible" && !overlayOpen()) {
        const r = frame.getBoundingClientRect();
        if (r.width > 1 && r.height > 1) bounds = { x: r.left, y: r.top, width: r.width, height: r.height };
      }
      const key = JSON.stringify(bounds);
      if (key !== last) {
        last = key;
        void window.workspace.preview.setBounds(bounds);
      }
      raf = window.setTimeout(tick, 120);
    };
    tick();
    return () => {
      window.clearTimeout(raf);
      void window.workspace.preview.setBounds(null);
    };
  }, [visible]);

  return (
    <div ref={stageRef} className={cn("relative flex min-h-0 flex-1 items-center justify-center overflow-hidden", size && "bg-[repeating-conic-gradient(rgb(var(--bg-hover))_0_25%,transparent_0_50%)] bg-[length:16px_16px]")}>
      <div
        ref={frameRef}
        style={{ width: frameW, height: frameH }}
        className={cn("bg-white", size && "rounded-md shadow-pop ring-1 ring-border")}
        data-preview-frame
      />
    </div>
  );
}

function ConsoleView({ entries, onClear }: { entries: PreviewConsoleEntry[]; onClear: () => void }) {
  const tone = { error: "text-danger", warning: "text-warning", info: "text-text-muted", debug: "text-text-faint" } as const;
  return (
    <div className="flex h-44 shrink-0 flex-col border-t border-border-subtle bg-bg-elevated">
      <div className="flex items-center justify-between px-3 py-1 text-[11px] text-text-faint">
        <span>{tr("Console da página")}</span>
        <Button size="icon-sm" variant="ghost" onClick={onClear} title={tr("Limpar")} aria-label={tr("Limpar")}>
          <Trash2 size={11} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-[11.5px]">
        {entries.length === 0 ? (
          <p className="text-text-faint">{tr("Nada no console ainda.")}</p>
        ) : (
          entries.map((e, i) => (
            <div key={i} className={cn("flex gap-2 border-b border-border-subtle/50 py-0.5", tone[e.level])}>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{e.message}</span>
              {e.source && <span className="max-w-[40%] shrink-0 truncate text-text-faint">{e.source.split("/").pop()}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Escolhe um servidor do runner (ou um script para subir) quando nada está aberto. */
function StartPicker({ servers, onOpen, projectId }: { servers: RunnerProcess[]; onOpen: (url: string) => void; projectId?: string | null }) {
  const projects = useProjectsStore((s) => s.projects);
  const { runScript } = useRunnerStore();
  const [scripts, setScripts] = useState<{ pm: string; list: { name: string; command: string }[] } | null>(null);
  const active = projects.filter((p) => !p.archivedAt);
  const [pid, setPid] = useState(projectId ?? active[0]?.id ?? "");

  useEffect(() => {
    if (!pid) return;
    void attempt(window.workspace.runner.scripts(pid)).then((s) =>
      setScripts(s ? { pm: s.packageManager, list: s.scripts.filter((x) => /^(dev|start|serve|preview|watch)(:|$)/.test(x.name)) } : null)
    );
  }, [pid]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <EmptyState mascot title={tr("Nenhuma página aberta")} description={tr("Abra um servidor que já está rodando ou suba o servidor de dev de um projeto.")} className="py-2" />
        {servers.length > 0 && (
          <div>
            <p className="section-title mb-1.5">{tr("Servidores rodando")}</p>
            {servers.flatMap((s) =>
              s.urls.map((u) => (
                <button key={s.id + u} onClick={() => onOpen(u)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-hover">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  <span className="text-sm text-text">{s.projectName}</span>
                  <span className="font-mono text-xs text-text-faint">{s.script ?? s.command}</span>
                  <span className="ml-auto font-mono text-xs text-accent">{u.replace(/^https?:\/\//, "")}</span>
                </button>
              ))
            )}
          </div>
        )}
        {active.length > 0 && (
          <div>
            <p className="section-title mb-1.5">{tr("Subir o servidor de dev")}</p>
            <select className="input mb-1.5" value={pid} onChange={(e) => setPid(e.target.value)} aria-label={tr("Projeto")}>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {scripts?.list.length === 0 && <p className="text-xs text-text-faint">{tr("Este projeto não tem script dev, start, serve ou preview.")}</p>}
            {scripts?.list.map((s) => (
              <button
                key={s.name}
                onClick={() => void runScript(pid, s.name, s.command, scripts.pm)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-hover"
              >
                <Play size={12} className="text-accent" />
                <span className="font-mono text-xs text-text">{s.name}</span>
                <span className="truncate font-mono text-[11px] text-text-faint">{s.command}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Preview web completo: barra de navegação, aparelhos (desktop/tablet/celular/personalizado),
 * zoom, console da página e atalho para a saída do servidor no runner.
 * `visible`: o painel está na tela (páginas escondidas não desenham a view nativa).
 */
export function PreviewPanel({ visible, projectId, compact = false }: { visible: boolean; projectId?: string | null; compact?: boolean }) {
  const [state, setState] = useState<PreviewState | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<PreviewConsoleEntry[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);
  const [address, setAddress] = useState("");
  const { processes, init, select } = useRunnerStore();
  const navigate = useUIStore((s) => s.navigate);
  const { loaded, load } = useProjectsStore();

  const setPrefs = (patch: Partial<Prefs>) =>
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      writePrefs(next);
      return next;
    });

  useEffect(() => {
    init();
    if (!loaded) void load();
    void attempt(window.workspace.preview.state()).then((s) => s && setState(s));
    void attempt(window.workspace.preview.console()).then((c) => c && setConsoleEntries(c));
    const offState = window.workspace.preview.onState(setState);
    const offConsole = window.workspace.preview.onConsole((e) => setConsoleEntries((list) => [...list.slice(-299), e]));
    return () => {
      offState();
      offConsole();
    };
  }, [init, load, loaded]);

  useEffect(() => {
    if (state?.url) setAddress(state.url);
  }, [state?.url]);

  const servers = processes.filter((p) => p.status === "running" && p.urls.length > 0 && (!projectId || p.projectId === projectId));
  // O servidor do runner que serve a página aberta (para logs e status).
  const server = state?.url ? processes.find((p) => p.urls.some((u) => state.url!.startsWith(u.replace(/\/$/, "")))) : undefined;
  const errors = consoleEntries.filter((e) => e.level === "error").length;

  const open = async (url: string) => {
    const target = /^https?:\/\//.test(url) ? url : `http://${url}`;
    if (!isLocal(target)) {
      toast.error(tr("O preview só abre endereços locais (localhost)."));
      return;
    }
    setConsoleEntries([]);
    const s = await attempt(window.workspace.preview.open(target));
    if (s) {
      setState(s);
      setPrefs({ lastUrl: target });
    }
  };

  // Quando um servidor novo anuncia o endereço e nada está aberto, abre sozinho uma vez
  // (só carrega a página; nada roda). Fechar o preview não faz ele reabrir.
  const autoOpened = useRef(new Set<string>());
  useEffect(() => {
    if (!state || state.open) return;
    const fresh = servers.find((s) => !autoOpened.current.has(s.id) && s.urls[0]);
    servers.forEach((s) => autoOpened.current.add(s.id));
    if (fresh && servers.length === 1) void open(fresh.urls[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers.map((s) => s.id + s.urls.length).join(), state?.open]);

  const size: [number, number] | null =
    prefs.device === "auto" ? null : prefs.device === "custom" ? prefs.custom : DEVICE_SIZE[prefs.device];
  const finalSize = size && prefs.rotated ? ([size[1], size[0]] as [number, number]) : size;

  const copy = async () => {
    if (!state?.url) return;
    try {
      await navigator.clipboard.writeText(state.url);
      toast.success(tr("Endereço copiado"));
    } catch {
      toast.error(tr("Não foi possível copiar."));
    }
  };

  const deviceBtn = (d: Device, Icon: typeof Monitor, label: string) => (
    <Button size="icon-sm" variant="ghost" className={cn(prefs.device === d && "bg-bg-hover text-accent")} onClick={() => setPrefs({ device: d })} title={label} aria-label={label} aria-pressed={prefs.device === d}>
      <Icon size={13} />
    </Button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border-subtle px-2 py-1.5">
        <Button size="icon-sm" variant="ghost" disabled={!state?.canGoBack} onClick={() => void attempt(window.workspace.preview.back())} aria-label={tr("Voltar")} title={tr("Voltar")}>
          <ArrowLeft size={13} />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!state?.canGoForward} onClick={() => void attempt(window.workspace.preview.forward())} aria-label={tr("Avançar")} title={tr("Avançar")}>
          <ArrowRight size={13} />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!state?.open} onClick={() => void attempt(window.workspace.preview.reload())} aria-label={tr("Recarregar")} title={tr("Recarregar")}>
          <RefreshCw size={13} className={cn(state?.loading && "animate-spin")} />
        </Button>
        <form
          className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-md border border-border-subtle bg-bg px-2 py-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            void open(address.trim());
          }}
        >
          <Globe size={12} className="shrink-0 text-text-faint" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="localhost:5173"
            spellCheck={false}
            className="w-full bg-transparent font-mono text-xs text-text placeholder:text-text-faint focus:outline-none"
            aria-label={tr("Endereço")}
          />
        </form>
        <Button size="icon-sm" variant="ghost" disabled={!state?.url} onClick={() => void copy()} aria-label={tr("Copiar endereço")} title={tr("Copiar endereço")}>
          <Copy size={12} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={!state?.url}
          onClick={() => state?.url && void attempt(window.workspace.system.openExternalUrl(state.url))}
          aria-label={tr("Abrir no navegador")}
          title={tr("Abrir no navegador")}
        >
          <ExternalLink size={12} />
        </Button>
        {!compact && <span className="mx-1 h-4 w-px bg-border-subtle" />}
        {deviceBtn("auto", Globe, tr("Livre (ocupa a área toda)"))}
        {deviceBtn("desktop", Monitor, tr("Desktop (1440×900)"))}
        {deviceBtn("tablet", Tablet, tr("Tablet (820×1180)"))}
        {deviceBtn("phone", Smartphone, tr("Celular (390×844)"))}
        {deviceBtn("custom", Monitor, tr("Tamanho personalizado"))}
        {prefs.device === "custom" && (
          <span className="flex items-center gap-0.5 font-mono text-[11px]">
            {[0, 1].map((i) => (
              <input
                key={i}
                type="number"
                min={200}
                max={3840}
                value={prefs.custom[i]}
                onChange={(e) => {
                  const next = [...prefs.custom] as [number, number];
                  next[i] = Math.max(200, Math.min(3840, Number(e.target.value) || 200));
                  setPrefs({ custom: next });
                }}
                className="input w-16 px-1 py-0.5 text-[11px]"
                aria-label={i === 0 ? tr("Largura") : tr("Altura")}
              />
            ))}
          </span>
        )}
        {prefs.device !== "auto" && (
          <Button size="icon-sm" variant="ghost" onClick={() => setPrefs({ rotated: !prefs.rotated })} aria-label={tr("Girar")} title={tr("Girar")}>
            <RotateCw size={12} />
          </Button>
        )}
        <select className="input w-auto py-0.5 pr-6 text-[11px]" value={prefs.zoom} onChange={(e) => setPrefs({ zoom: e.target.value as Zoom })} aria-label={tr("Zoom")}>
          {ZOOMS.map((z) => (
            <option key={z} value={z}>
              {z === "fit" ? tr("Ajustar") : `${Math.round(Number(z) * 100)}%`}
            </option>
          ))}
        </select>
        <Button
          size="xs"
          variant="ghost"
          className={cn(showConsole && "bg-bg-hover")}
          onClick={() => setShowConsole(!showConsole)}
          title={tr("Console da página")}
        >
          <Bug size={12} />
          {errors > 0 && <Badge tone="danger">{errors}</Badge>}
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={!state?.open} onClick={() => void attempt(window.workspace.preview.devtools())} aria-label={tr("DevTools da página")} title={tr("DevTools da página")}>
          <TerminalIcon size={12} />
        </Button>
        {state?.open && (
          <Button size="icon-sm" variant="ghost" onClick={() => void attempt(window.workspace.preview.close())} aria-label={tr("Fechar preview")} title={tr("Fechar preview")}>
            <X size={13} />
          </Button>
        )}
      </div>

      {(server || state?.error) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-1 text-[11px]">
          {server && (
            <button
              className="flex items-center gap-1.5 text-text-muted hover:text-text"
              onClick={() => {
                select(server.id);
                navigate("processos");
              }}
              title={tr("Ver a saída")}
            >
              <ProjectIcon name={server.projectName} icon={undefined} size={14} className="rounded-[4px] text-[7px]" />
              {server.projectName} · <span className="font-mono">{server.script ?? server.command}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", server.status === "running" ? "bg-success" : "bg-danger")} />
            </button>
          )}
          {state?.error && <span className="truncate text-danger">{state.error}</span>}
          {servers.length > 1 && (
            <span className="ml-auto flex items-center gap-1 text-text-faint">
              {trn(servers.length, "{n} servidor", "{n} servidores")}:
              {servers.map((s) => (
                <button key={s.id} onClick={() => void open(s.urls[0])} className="rounded px-1 font-mono hover:bg-bg-hover hover:text-text">
                  {s.urls[0].replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {state?.open ? (
        <PreviewStage visible={visible} size={finalSize} zoom={prefs.zoom} />
      ) : (
        <StartPicker servers={servers} onOpen={(u) => void open(u)} projectId={projectId} />
      )}
      {showConsole && (
        <ConsoleView
          entries={consoleEntries}
          onClear={() => {
            setConsoleEntries([]);
            void window.workspace.preview.clearConsole();
          }}
        />
      )}
    </div>
  );
}
