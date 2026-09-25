import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ExternalLink, Plus, SquareTerminal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/primitives";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { basename } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUIStore } from "@/stores/useUIStore";

import { tr } from "@/lib/i18n";
type Shell = "powershell" | "cmd";

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

function TerminalView({ tab, active, onExit }: { tab: Tab; active: boolean; onExit: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState<number | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

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

    const inputSub = term.onData((data) => {
      if (sessionId) void window.workspace.terminal.write(sessionId, data);
    });
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
        dataHandlers.set(session.id, (data) => term.write(data));
        exitHandlers.set(session.id, (code) => {
          setExited(code);
          sessionId = null;
          term.write(`\r\n\x1b[90m[${tr("processo encerrado com código {code}", { code })}]\x1b[0m\r\n`);
        });
        const buffered = pendingData.get(session.id);
        if (buffered) {
          term.write(buffered);
          pendingData.delete(session.id);
        }
        term.focus();
      } catch (err) {
        if (!disposed) setError(errorMessage(err));
      }
    })();

    return () => {
      disposed = true;
      inputSub.dispose();
      resizeSub.dispose();
      if (sessionId) {
        dataHandlers.delete(sessionId);
        exitHandlers.delete(sessionId);
        void window.workspace.terminal.kill(sessionId);
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [tab.cwd, tab.shell]);

  // Reajusta ao redimensionar a janela ou ao trocar de aba.
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
    if (!active) return;
    const t = setTimeout(() => {
      fitRef.current?.fit();
      termRef.current?.focus();
    }, 10);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div className={cn("absolute inset-0 flex-col", active ? "flex" : "hidden")}>
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

export function TerminalPage() {
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);
  const { projects, loaded, load } = useProjectsStore();
  const settings = useSettingsStore((s) => s.settings);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [shell, setShell] = useState<Shell>(settings?.defaultTerminal ?? "powershell");
  const handledParam = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded) void load();
    void attempt(window.workspace.terminal.available()).then((ok) => setAvailable(ok ?? false));
  }, [loaded, load]);

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
      void attempt(window.workspace.system.openTerminal(cwd, sh));
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
  }

  // `pageParam` = id do projeto: abre um terminal nele assim que der.
  useEffect(() => {
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
  }, [pageParam, available, loaded, projects]);

  const targetLabel = locations.find((l) => l.value === target)?.label ?? basename(target);

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
      <select className="input w-32 py-1 text-xs" value={shell} onChange={(e) => setShell(e.target.value as Shell)}>
        <option value="powershell">{tr("PowerShell")}</option>
        <option value="cmd">{tr("CMD")}</option>
      </select>
      <Button size="sm" onClick={() => target && openTab(target, targetLabel)} disabled={!target}>
        {available === false ? <ExternalLink size={13} /> : <Plus size={13} />}
        {available === false ? tr("Abrir terminal externo") : tr("Novo terminal")}
      </Button>
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
                <SquareTerminal size={12} className="text-text-faint" />
                {t.title}
                <span className="text-[10px] text-text-faint">{t.shell === "cmd" ? tr("CMD") : tr("PS")}</span>
              </button>
              <button onClick={() => closeTab(t.key)} className="rounded p-0.5 text-text-faint hover:text-text" aria-label={tr("Fechar terminal")}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
        {toolbar}
      </div>

      <div className="relative min-h-0 flex-1 bg-bg">
        {tabs.map((t) => (
          <TerminalView key={t.key} tab={t} active={t.key === activeKey} onExit={() => closeTab(t.key)} />
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
