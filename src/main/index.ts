import { app, BrowserWindow, Menu, Tray, nativeImage, session, shell } from "electron";
import path from "node:path";
import { registerIpcHandlers, setDevServerUrl } from "./ipc/handlers.js";
import { closeDb, getDb, getSettings } from "./database/db.js";
import { createLogger, initLogger } from "./logger.js";
import { isProtocolAllowed } from "./security/commands.js";
import { listProjects } from "./services/projectService.js";
import { detectVSCode, openInVSCode } from "./services/systemService.js";
import { spawnDetached } from "./security/exec.js";
import { startNotifications, stopNotifications } from "./services/notificationService.js";
import { killAll as killAllTerminals } from "./services/terminalService.js";
import { listIntegrationStatus } from "./services/integrationsService.js";
import * as googleCalendar from "./integrations/googleCalendar.js";
import type { AppCommand } from "../shared/types.js";

const isDev = !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:5173";
const startHidden = process.argv.includes("--hidden");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// Sinaliza que o app está realmente saindo (vs. apenas fechando a janela para a bandeja).
let isQuitting = false;

initLogger(path.join(app.getPath("userData"), "logs"));
const log = createLogger("main");

// Uma única instância: abrir o atalho de novo só traz a janela existente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.setAppUserModelId("com.pedroqueiroz.workspace");

function resourcePath(...segments: string[]): string {
  // Em dev, direto da pasta build/ do repo. Empacotado, o electron-builder
  // copia para resources/ (extraResources), fora do asar.
  return isDev ? path.join(__dirname, "../../build", ...segments) : path.join(process.resourcesPath, "build", ...segments);
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function sendCommand(command: AppCommand): void {
  showWindow();
  const send = () => mainWindow?.webContents.send("app:command", command);
  if (mainWindow?.webContents.isLoading()) mainWindow.webContents.once("did-finish-load", send);
  else send();
}

function navigate(page: string): void {
  showWindow();
  mainWindow?.webContents.send("app:navigate", page);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: "PQueiroz Workspace",
    backgroundColor: "#0b0d10",
    autoHideMenuBar: true,
    icon: resourcePath("icon.png"),
    webPreferences: {
      // Configuração mínima de segurança exigida pela spec do projeto.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      preload: path.join(__dirname, "../preload/index.js"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!startHidden) mainWindow?.show();
  });

  // Qualquer tentativa de navegação para fora do app ou de abrir uma nova janela
  // é redirecionada ao navegador padrão (se o protocolo for permitido) — o
  // Workspace nunca renderiza conteúdo remoto dentro de si mesmo.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isProtocolAllowed(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const internal = url.startsWith("file://") || (isDev && url.startsWith(DEV_SERVER_URL));
    if (!internal) {
      event.preventDefault();
      if (isProtocolAllowed(url)) void shell.openExternal(url);
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting && getSettings().minimizeToTray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    if (process.env.WORKSPACE_DEVTOOLS === "1") mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // __dirname aqui é dist-electron/main; o renderer buildado fica em dist/renderer.
    void mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }
}

function buildTrayMenu(): Menu {
  const recent = listProjects()
    .filter((p) => p.lastOpenedAt)
    .slice(0, 5);
  return Menu.buildFromTemplate([
    { label: "PQueiroz Workspace", enabled: false },
    { type: "separator" },
    { label: "Abrir Workspace", click: showWindow },
    { label: "Nova tarefa", click: () => sendCommand("new-task") },
    {
      label: "Abrir VS Code",
      click: () => {
        const exe = detectVSCode();
        if (exe) void spawnDetached(exe, []).catch((err) => log.error("Falha ao abrir VS Code:", err));
      },
    },
    {
      label: "Abrir projeto recente",
      enabled: recent.length > 0,
      submenu: recent.map((p) => ({
        label: p.name,
        click: () => void openInVSCode(p.localPath).catch((err) => log.error("Falha ao abrir projeto:", err)),
      })),
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray(): void {
  const icon = nativeImage.createFromPath(resourcePath("icon.png")).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("PQueiroz Workspace");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", showWindow);
  // Recria o menu ao abrir, para a lista de projetos recentes estar atualizada.
  tray.on("right-click", () => tray?.setContextMenu(buildTrayMenu()));
}

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.scdn.co https://*.spotifycdn.com https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join("; ");

// Em dev o Vite precisa de script inline (react-refresh) e WebSocket (HMR).
const DEV_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${DEV_SERVER_URL}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.scdn.co https://*.spotifycdn.com https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${DEV_SERVER_URL} ws://localhost:5173`,
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

function configureSession(): void {
  const ses = session.defaultSession;

  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [isDev ? DEV_CSP : PROD_CSP],
        "X-Content-Type-Options": ["nosniff"],
      },
    });
  });

  // Nenhuma permissão de navegador (câmera, microfone, geolocalização...) é
  // concedida à UI, exceto escrever na área de transferência (botão "copiar").
  const allowed = new Set(["clipboard-sanitized-write"]);
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

app.on("web-contents-created", (_event, contents) => {
  // Webviews nunca são permitidas.
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

app.on("second-instance", showWindow);

app.whenReady().then(() => {
  try {
    getDb(); // aplica migrations na primeira execução
  } catch (err) {
    log.error("Falha ao abrir o banco de dados:", err);
    throw err;
  }
  configureSession();
  setDevServerUrl(isDev ? DEV_SERVER_URL : null);
  registerIpcHandlers();
  createWindow();
  createTray();
  startNotifications(navigate);
  log.info(`PQueiroz Workspace ${app.getVersion()} iniciado${isDev ? " (dev)" : ""}`);

  // Sincronização do Google Calendar sob demanda: só se estiver conectado, e
  // depois do startup, para não atrasar a abertura do app.
  setTimeout(() => {
    const gc = listIntegrationStatus().find((i) => i.id === "google_calendar");
    if (gc?.state === "connected") {
      googleCalendar.sync().catch((err) => log.warn("Sincronização do Google Calendar falhou:", err));
    }
  }, 15_000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  stopNotifications();
  killAllTerminals();
});

app.on("will-quit", () => {
  closeDb();
});

process.on("uncaughtException", (err) => log.error("uncaughtException:", err));
process.on("unhandledRejection", (reason) => log.error("unhandledRejection:", reason));
