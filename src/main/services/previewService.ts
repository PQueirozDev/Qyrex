import { BrowserWindow, WebContentsView, session, shell, type Session } from "electron";
import { createLogger } from "../logger.js";
import { tt } from "../i18n.js";
import { isProtocolAllowed } from "../security/commands.js";
import type { PreviewBounds, PreviewConsoleEntry, PreviewState } from "../../shared/types.js";

/**
 * Preview web integrado: a aplicação local do usuário (servidor de dev) aparece
 * dentro do Qyrex numa `WebContentsView` nativa, sobreposta à área da página.
 *
 * Isolamento (o conteúdo é código do usuário, mas pode carregar qualquer coisa):
 * - sessão própria e temporária (`preview`), separada da sessão do app: não vê
 *   cookies, armazenamento nem a CSP do Qyrex;
 * - sem preload, sem Node, sandbox e contextIsolation: nenhuma API do Electron
 *   ou do `window.workspace` chega à página;
 * - só navega em endereços locais (localhost, 127.0.0.1, [::1], *.localhost);
 *   links externos vão para o navegador padrão, novas janelas são negadas;
 * - todas as permissões (câmera, microfone, notificações...) e downloads são negados.
 */

const log = createLogger("preview");
const MAX_CONSOLE = 300;

let host: BrowserWindow | null = null;
let view: WebContentsView | null = null;
let previewSession: Session | null = null;
let attached = false;
let consoleLog: PreviewConsoleEntry[] = [];
let lastError: string | null = null;
let listener: ((event: { type: "state"; state: PreviewState } | { type: "console"; entry: PreviewConsoleEntry }) => void) | null = null;

export function setPreviewListener(fn: typeof listener): void {
  listener = fn;
}

/** Endereço que o preview aceita abrir. Exportado para testes. */
export function isLocalPreviewUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const h = url.hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost");
}

function getSession(): Session {
  if (previewSession) return previewSession;
  // Sem "persist:": nada do preview fica gravado em disco.
  const ses = session.fromPartition("qyrex-preview");
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());
  previewSession = ses;
  return ses;
}

export function getState(): PreviewState {
  const wc = view?.webContents;
  if (!wc || wc.isDestroyed()) {
    return { open: false, url: null, title: null, loading: false, canGoBack: false, canGoForward: false, error: null, zoom: 1 };
  }
  return {
    open: true,
    url: wc.getURL() || null,
    title: wc.getTitle() || null,
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    error: lastError,
    zoom: wc.getZoomFactor(),
  };
}

function emitState(): void {
  listener?.({ type: "state", state: getState() });
}

function pushConsole(entry: PreviewConsoleEntry): void {
  consoleLog = [...consoleLog.slice(-(MAX_CONSOLE - 1)), entry];
  listener?.({ type: "console", entry });
}

export function setPreviewHost(win: BrowserWindow): void {
  host = win;
  win.on("closed", () => {
    host = null;
    view = null;
    attached = false;
  });
}

function ensureView(): WebContentsView {
  if (view && !view.webContents.isDestroyed()) return view;
  if (!host) throw new Error("Janela principal indisponível.");
  const v = new WebContentsView({
    webPreferences: {
      session: getSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      // Sem preload: a página nunca recebe `window.workspace`.
    },
  });
  const wc = v.webContents;
  v.setBackgroundColor("#ffffff");

  // Novas janelas: endereço local abre no próprio preview; externo vai para o navegador.
  wc.setWindowOpenHandler(({ url }) => {
    if (isLocalPreviewUrl(url)) void wc.loadURL(url);
    else if (isProtocolAllowed(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  const guard = (event: Electron.Event, url: string) => {
    if (isLocalPreviewUrl(url)) return;
    event.preventDefault();
    pushConsole({ level: "warning", message: tt("Navegação bloqueada (fora do localhost): {url}", { url }), source: null, at: new Date().toISOString() });
    if (isProtocolAllowed(url)) void shell.openExternal(url);
  };
  wc.on("will-navigate", guard);
  wc.on("will-redirect", guard);
  wc.on("will-attach-webview", (event) => event.preventDefault());

  wc.on("did-start-loading", () => {
    lastError = null;
    emitState();
  });
  wc.on("did-stop-loading", emitState);
  wc.on("did-navigate", emitState);
  wc.on("did-navigate-in-page", emitState);
  wc.on("page-title-updated", emitState);
  wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    // -3 = navegação cancelada (ex.: outra navegação começou); não é erro.
    if (!isMainFrame || code === -3) return;
    lastError = `${description} (${code}) — ${url}`;
    emitState();
  });
  wc.on("render-process-gone", (_e, details) => {
    lastError = tt("A página parou ({reason}).", { reason: details.reason });
    emitState();
  });
  wc.on("console-message", (event) => {
    const { level, message, lineNumber, sourceId } = event as unknown as { level: PreviewConsoleEntry["level"]; message: string; lineNumber: number; sourceId: string };
    pushConsole({ level, message: message.slice(0, 4000), source: sourceId ? `${sourceId}:${lineNumber}` : null, at: new Date().toISOString() });
  });

  view = v;
  attached = false;
  return v;
}

function attach(): void {
  if (!host || !view || attached) return;
  host.contentView.addChildView(view);
  attached = true;
}

export async function open(url: string): Promise<PreviewState> {
  if (!isLocalPreviewUrl(url)) throw new Error("O preview só abre endereços locais (localhost).");
  const v = ensureView();
  attach();
  lastError = null;
  consoleLog = [];
  log.info(`preview: ${url}`);
  try {
    await v.webContents.loadURL(url);
  } catch (err) {
    // did-fail-load já registrou o erro (servidor fora do ar, porta errada...).
    if (!lastError) lastError = err instanceof Error ? err.message : String(err);
  }
  emitState();
  return getState();
}

/** Posição/tamanho da área do preview na janela (px CSS do renderer). `null` esconde. */
export function setBounds(bounds: PreviewBounds | null): void {
  if (!view || view.webContents.isDestroyed()) return;
  if (!bounds || bounds.width < 2 || bounds.height < 2) {
    view.setVisible(false);
    return;
  }
  attach();
  view.setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) });
  view.setVisible(true);
}

function wc() {
  const w = view?.webContents;
  if (!w || w.isDestroyed()) throw new Error("Nenhum preview aberto.");
  return w;
}

export function reload(): void {
  lastError = null;
  wc().reload();
}
export function back(): void {
  if (wc().navigationHistory.canGoBack()) wc().navigationHistory.goBack();
}
export function forward(): void {
  if (wc().navigationHistory.canGoForward()) wc().navigationHistory.goForward();
}
export function setZoom(factor: number): void {
  wc().setZoomFactor(Math.min(3, Math.max(0.25, factor)));
  emitState();
}
export function openDevTools(): void {
  wc().openDevTools({ mode: "detach" });
}
export function getConsole(): PreviewConsoleEntry[] {
  return consoleLog;
}
export function clearConsole(): void {
  consoleLog = [];
}

export function close(): void {
  if (!view) return;
  if (host && attached) host.contentView.removeChildView(view);
  if (!view.webContents.isDestroyed()) view.webContents.close();
  view = null;
  attached = false;
  lastError = null;
  emitState();
}
