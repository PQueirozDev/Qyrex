import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ExternalLink, LayoutGrid, Plus, Rows2, SquareTerminal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/primitives";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { basename } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast, useUIStore } from "@/stores/useUIStore";

import { tr } from "@/lib/i18n";
type Shell = "powershell" | "cmd" | "claude" | "codex";
/** starting: abrindo; busy: produzindo saída; idle: parado esperando o usuário; ended: processo encerrado. */
type Status = "starting" | "busy" | "idle" | "ended";
type Layout = "tabs" | "grid";

const SHELL_LABEL: Record<Shell, string> = { powershell: "PowerShell", cmd: "CMD", claude: "Claude Code", codex: "Codex" };
const SHELL_BADGE: Record<Shell, string> = { powershell: "PS", cmd: "CMD", claude: "Claude", codex: "Codex" };

/** Saída que chega até este tempo depois de uma tecla é eco do que o usuário digitou, não trabalho. */
const ECHO_MS = 400;
/** Sem saída por este tempo: o terminal parou e está esperando. */
const IDLE_MS = 2500;
/** Só avisa "terminou" se o trabalho durou pelo menos isto (evita aviso a cada `dir`). */
const NOTIFY_MIN_MS = 8000;

const LAYOUT_KEY = "qrz.terminalLayout";
function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "tabs";
  } catch {
    return "tabs";
  }
}

/**
 * Um único listener de `terminal:data`/`terminal:exit` para o app. Os dados que
 * chegam antes de o `terminal:create` responder (o prompt inicial do shell)
 * ficam guardados até a aba registrar o id da sessão.
 */
type DataHandler = (data: string) => void;
type ExitHandler = (exitCode: number) => void;
const dataHandlers = new Map<string, DataHandler>();
const exitHandlers = new Map<string, ExitHandler>();
const pendingData = new Map<string, string>();
let subscribed = false;

function ensureSubscribed() {
  if (subscribed) return;
  subscribed = true;
  window.workspace.terminal.onData(({ id, data }) => {
    const handler = dataHandlers.get(id);
    if (handler) handler(data);
    else pendingData.set(id, (pendingData.get(id) ?? "") + data);
  });
  window.workspace.terminal.onExit(({ id, exitCode }) => exitHandlers.get(id)?.(exitCode));
}

function cssColor(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `rgb(${value.split(/\s+/).join(", ")})` : "#000";
}

interface Tab {
  key: string;
  cwd: string;
  shell: Shell;
  title: string;
}

function StatusDot({ status }: { status: Status | undefined }) {
  const label = status === "busy" ? tr("Trabalhando") : status === "idle" ? tr("Esperando você") : status === "ended" ? tr("Encerrado") : tr("Abrindo");
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        status === "busy" && "animate-pulse bg-accent",
        status === "idle" && "bg-success",
        status === "ended" && "bg-text-faint",
        (status === undefined || status === "starting") && "bg-warning"
      )}
    />
  );
}

function TerminalView({
  tab,
  layout,
  shown,
  focused,
  status,
  onFocus,
  onStatus,
  onExit,
}: {
  tab: Tab;
  layout: Layout;
  /** O painel está na tela (página aberta e, no modo abas, é a aba ativa). */
  shown: boolean;
  focused: boolean;
  status: Status | undefined;
  onFocus: () => void;
  onStatus: (status: Status) => void;
  onExit: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState<number | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    ensureSubscribed();
    const term = new Terminal({
      fontFamily: "Cascadia Code, Consolas, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: false,
      // Garante texto legível (WCAG AA) mesmo com as cores ANSI no tema claro.
      minimumContrastRatio: 4.5,
      theme: {
        background: cssColor("--bg"),
        foreground: cssColor("--text"),
        cursor: cssColor("--accent"),
        selectionBackground: "rgba(104, 140, 255, 0.3)",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current!);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let sessionId: string | null = null;
    let disposed = false;

    // Estado da sessão, deduzido da saída: saída contínua = trabalhando; silêncio = esperando.
    let status: Status = "starting";
    let lastInput = 0;
    let lastOutput = 0;
    let busySince = 0;
    const setStatus = (next: Status) => {
      if (status === next) return;
      status = next;
      onStatusRef.current(next);
    };
    function finished() {
      if (!sessionId) return;
      if (document.hidden || !document.hasFocus()) void attempt(window.workspace.terminal.notifyDone(sessionId));
      else if (!shownRef.current) toast.info(tr("{name} terminou em {folder}.", { name: SHELL_LABEL[tab.shell], folder: tab.title }));
    }
    const idleTimer = setInterval(() => {
      if (status !== "busy" || Date.now() - lastOutput < IDLE_MS) return;
      const worked = lastOutput - busySince;
      setStatus("idle");
      if (worked >= NOTIFY_MIN_MS) finished();
    }, 1000);
    function onOutput() {
      const now = Date.now();
      if (now - lastInput < ECHO_MS) return;
      lastOutput = now;
      if (status !== "busy") {
        busySince = now;
        setStatus("busy");
      }
    }

    const inputSub = term.onData((data) => {
      if (!sessionId) return;
      lastInput = Date.now();
      // O canal aceita até 100 mil caracteres por chamada; colagens grandes vão em pedaços (a ordem do IPC é mantida).
      for (let i = 0; i < data.length; i += 50_000) void window.workspace.terminal.write(sessionId, data.slice(i, i + 50_000));
    });

    // Copiar e colar como no Windows Terminal. O xterm não faz isso sozinho e a UI não pode
    // ler a área de transferência, então o texto vem do main.
    function copySelection() {
      const text = term.getSelection();
      if (text) void navigator.clipboard.writeText(text);
      term.clearSelection();
    }
    async function pasteClipboard() {
      const clip = await attempt(window.workspace.terminal.readClipboard());
      if (!clip || !sessionId) return;
      if (clip.text) term.paste(clip.text);
      // Só imagem (print, foto copiada): manda o Ctrl+V cru para o programa ler a imagem ele mesmo.
      else if (clip.hasImage) void window.workspace.terminal.write(sessionId, "\x16");
    }
    term.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase();
      const ctrlOnly = event.ctrlKey && !event.altKey && !event.metaKey;
      const isCopy = (ctrlOnly && key === "c" && (event.shiftKey || term.hasSelection())) || (ctrlOnly && !event.shiftKey && key === "insert");
      const isPaste = (ctrlOnly && key === "v") || (event.shiftKey && !event.ctrlKey && !event.altKey && key === "insert");
      if (!isCopy && !isPaste) return true;
      // Bloqueia também o "paste" nativo do navegador, senão o texto entraria duas vezes.
      event.preventDefault();
      if (event.type === "keydown") {
        if (isCopy) copySelection();
        else void pasteClipboard();
      }
      return false;
    });
    // Botão direito: copia se houver seleção, senão cola.
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (term.hasSelection()) copySelection();
      else void pasteClipboard();
    };
    const container = containerRef.current!;
    container.addEventListener("contextmenu", onContextMenu);
    const resizeSub = term.onResize(({ cols, rows }) => {
      if (sessionId) void window.workspace.terminal.resize(sessionId, cols, rows);
    });

    void (async () => {
      try {
        const session = await unwrap(
          window.workspace.terminal.create({ cwd: tab.cwd, shell: tab.shell, cols: Math.max(10, term.cols), rows: Math.max(5, term.rows) })
        );
        if (disposed) {
          // A aba foi fechada (ou o React remontou) antes de a sessão abrir.
          void window.workspace.terminal.kill(session.id);
          return;
        }
        sessionId = session.id;
        dataHandlers.set(session.id, (data) => {
          term.write(data);
          onOutput();
        });
        exitHandlers.set(session.id, (code) => {
          setExited(code);
          setStatus("ended");
          sessionId = null;
          term.write(`\r\n\x1b[90m[${tr("processo encerrado com código {code}", { code })}]\x1b[0m\r\n`);
        });
        const buffered = pendingData.get(session.id);
        if (buffered) {
          term.write(buffered);
          pendingData.delete(session.id);
          onOutput();
        }
        term.focus();
      } catch (err) {
        if (!disposed) {
          setError(errorMessage(err));
          setStatus("ended");
        }
      }
    })();

    return () => {
      disposed = true;
      clearInterval(idleTimer);
      inputSub.dispose();
      resizeSub.dispose();
      container.removeEventListener("contextmenu", onContextMenu);
      if (sessionId) {
        dataHandlers.delete(sessionId);
        exitHandlers.delete(sessionId);
        void window.workspace.terminal.kill(sessionId);
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.cwd, tab.shell]);

  // Reajusta ao redimensionar a janela, ao trocar de aba ou de layout.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) fitRef.current?.fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shown || !focused) return;
    const t = setTimeout(() => {
      fitRef.current?.fit();
      termRef.current?.focus();
    }, 10);
    return () => clearTimeout(t);
  }, [shown, focused]);

  const grid = layout === "grid";
  return (
    <div
      onMouseDownCapture={onFocus}
      className={cn(
        "min-h-0 min-w-0 flex-col bg-bg",
        grid ? "relative flex" : cn("absolute inset-0", shown ? "flex" : "hidden"),
        grid && "ring-1 ring-inset",
        grid && (focused ? "ring-accent/60" : "ring-transparent")
      )}
    >
      {grid && (
        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-1 text-[11px] text-text-muted">
          <StatusDot status={status} />
          <span className="truncate" title={tab.cwd}>{tab.title}</span>
          <span className="text-[10px] text-text-faint">{SHELL_BADGE[tab.shell]}</span>
          <button onClick={() => onExitRef.current()} className="ml-auto rounded p-0.5 text-text-faint hover:text-text" aria-label={tr("Fechar terminal")}>
            <X size={11} />
          </button>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between gap-2 border-b border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <Button size="xs" variant="ghost" onClick={() => onExitRef.current()}>{tr("Fechar aba")}</Button>
        </div>
      )}
      {exited !== null && !error && (
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-1.5 text-xs text-text-muted">
          <span>{tr("Sessão encerrada (código {code}).", { code: String(exited) })}</span>
          <Button size="xs" variant="ghost" onClick={() => onExitRef.current()}>{tr("Fechar aba")}</Button>
        </div>
      )}
      <div ref={containerRef} className="min-h-0 flex-1 px-3 py-2" />
    </div>
  );
}

/** `visible`: a página fica montada escondida quando o usuário está em outra aba (ver App). */
export function TerminalPage({ visible = true }: { visible?: boolean }) {
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);
  const { projects, loaded, load } = useProjectsStore();
  const settings = useSettingsStore((s) => s.settings);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<{ claude: boolean; codex: boolean }>({ claude: false, codex: false });
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [shell, setShell] = useState<Shell>(settings?.defaultTerminal ?? "powershell");
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const handledParam = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded) void load();
    void attempt(window.workspace.terminal.available()).then((ok) => {
      setAvailable(ok ?? false);
      if (ok) void attempt(window.workspace.terminal.agents()).then((found) => found && setAgents(found));
    });
  }, [loaded, load]);

  function changeLayout(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // armazenamento indisponível: vale só nesta sessão
    }
  }

  // Pastas possíveis: projetos + diretórios autorizados.
  const locations = useMemo(() => {
    const list = projects.map((p) => ({ value: p.localPath, label: p.name, group: "Projetos" }));
    for (const dir of settings?.allowedProjectDirs ?? []) list.push({ value: dir, label: dir, group: "Pastas autorizadas" });
    return list;
  }, [projects, settings?.allowedProjectDirs]);

  useEffect(() => {
    if (!target && locations.length > 0) setTarget(locations[0].value);
  }, [locations, target]);

  function openTab(cwd: string, title: string, sh: Shell = shell) {
    if (available === false) {
      void attempt(window.workspace.system.openTerminal(cwd, sh === "cmd" ? "cmd" : "powershell"));
      return;
    }
    const key = crypto.randomUUID();
    setTabs((t) => [...t, { key, cwd, shell: sh, title }]);
    setActiveKey(key);
  }

  function closeTab(key: string) {
    setTabs((current) => {
      const next = current.filter((t) => t.key !== key);
      if (activeKey === key) setActiveKey(next.length ? next[next.length - 1].key : null);
      return next;
    });
    setStatuses((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)));
  }

  // `pageParam` = id do projeto: abre um terminal nele assim que der.
  // Escondida, a página ignora o parâmetro (ele pertence à aba que está aberta).
  useEffect(() => {
    if (!visible) return;
    if (!pageParam) {
      handledParam.current = null;
      return;
    }
    if (available === null || !loaded || handledParam.current === pageParam) return;
    handledParam.current = pageParam;
    const project = projects.find((p) => p.id === pageParam);
    if (project) {
      setTarget(project.localPath);
      openTab(project.localPath, project.name);
      void window.workspace.projects.touchOpened(project.id);
    }
    navigate("terminal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageParam, available, loaded, projects, visible]);

  const targetLabel = locations.find((l) => l.value === target)?.label ?? basename(target);
  const grid = layout === "grid" && tabs.length > 0;
  const columns = Math.ceil(Math.sqrt(tabs.length));
  const rows = Math.ceil(tabs.length / Math.max(1, columns));

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input w-56 py-1 text-xs" value={target} onChange={(e) => setTarget(e.target.value)}>
        {locations.length === 0 && <option value="">{tr("Nenhuma pasta autorizada")}</option>}
        {["Projetos", "Pastas autorizadas"].map((group) => {
          const items = locations.filter((l) => l.group === group);
          return items.length ? (
            <optgroup key={group} label={group}>
              {items.map((l) => (
                <option key={`${group}-${l.value}`} value={l.value}>
                  {l.label}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
      <select className="input w-36 py-1 text-xs" value={shell} onChange={(e) => setShell(e.target.value as Shell)}>
        <optgroup label={tr("Terminal")}>
          <option value="powershell">{tr("PowerShell")}</option>
          <option value="cmd">{tr("CMD")}</option>
        </optgroup>
        {available && (agents.claude || agents.codex) && (
          <optgroup label={tr("Agentes")}>
            {agents.claude && <option value="claude">{SHELL_LABEL.claude}</option>}
            {agents.codex && <option value="codex">{SHELL_LABEL.codex}</option>}
          </optgroup>
        )}
      </select>
      <Button size="sm" onClick={() => target && openTab(target, targetLabel)} disabled={!target}>
        {available === false ? <ExternalLink size={13} /> : <Plus size={13} />}
        {available === false ? tr("Abrir terminal externo") : tr("Novo terminal")}
      </Button>
      {available && (
        <div className="flex rounded-md border border-border-subtle p-0.5">
          {(
            [
              ["tabs", Rows2, tr("Um terminal por vez")],
              ["grid", LayoutGrid, tr("Todos os terminais lado a lado")],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              onClick={() => changeLayout(value)}
              title={label}
              aria-label={label}
              aria-pressed={layout === value}
              className={cn("rounded p-1 transition-colors", layout === value ? "bg-bg-hover text-text" : "text-text-faint hover:text-text")}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (available === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (available === false) {
    return (
      <div className="mx-auto max-w-[900px] px-7 py-6">
        <h1 className="text-lg font-semibold tracking-tight text-text">{tr("Terminal")}</h1>
        <p className="mb-5 mt-0.5 text-sm text-text-muted">{tr("O terminal integrado não está disponível neste sistema. Os terminais serão abertos numa janela externa.")}</p>
        <Card className="p-4">{toolbar}</Card>
        {locations.length === 0 && (
          <EmptyState
            icon={SquareTerminal}
            title={tr("Nenhuma pasta autorizada")}
            description={tr("Autorize uma pasta em Configurações para abrir terminais nela.")}
            action={
              <Button size="sm" variant="secondary" onClick={() => navigate("configuracoes")}>{tr("Abrir Configurações")}</Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <div
              key={t.key}
              className={cn(
                "group flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                t.key === activeKey ? "bg-bg-hover text-text" : "text-text-muted hover:bg-bg-hover/60"
              )}
            >
              <button onClick={() => setActiveKey(t.key)} className="flex items-center gap-1.5" title={t.cwd}>
                <StatusDot status={statuses[t.key]} />
                {t.title}
                <span className="text-[10px] text-text-faint">{SHELL_BADGE[t.shell]}</span>
              </button>
              <button onClick={() => closeTab(t.key)} className="rounded p-0.5 text-text-faint hover:text-text" aria-label={tr("Fechar terminal")}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
        {toolbar}
      </div>

      {/* Os painéis ficam sempre no mesmo pai: trocar de layout não remonta (nem mata) os terminais. */}
      <div
        className={cn("min-h-0 flex-1 bg-bg", grid ? "grid gap-px bg-border-subtle" : "relative")}
        style={grid ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : undefined}
      >
        {tabs.map((t) => (
          <TerminalView
            key={t.key}
            tab={t}
            layout={grid ? "grid" : "tabs"}
            shown={visible && (grid || t.key === activeKey)}
            focused={t.key === activeKey}
            status={statuses[t.key]}
            onFocus={() => setActiveKey(t.key)}
            onStatus={(s) => setStatuses((current) => ({ ...current, [t.key]: s }))}
            onExit={() => closeTab(t.key)}
          />
        ))}
        {tabs.length === 0 && (
          <EmptyState
            className="h-full"
            icon={SquareTerminal}
            title={tr("Nenhum terminal aberto")}
            description={
              locations.length === 0
                ? tr("Autorize uma pasta em Configurações para abrir terminais nela.")
                : tr("Escolha um projeto ou pasta autorizada e o shell, e clique em Novo terminal.")
            }
            action={
              locations.length === 0 ? (
                <Button size="sm" variant="secondary" onClick={() => navigate("configuracoes")}>{tr("Abrir Configurações")}</Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
