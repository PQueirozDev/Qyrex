import { app, dialog, shell, type BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { spawnDetached } from "../security/exec.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { EXTERNAL_COMMANDS, isProtocolAllowed } from "../security/commands.js";
import { getSettings, updateSettings } from "../database/db.js";
import { createLogger } from "../logger.js";

const log = createLogger("system");

// --- VS Code -------------------------------------------------------------------

/**
 * Localiza o executável real do VS Code (Code.exe). Não usamos `code.cmd`
 * porque arquivos .cmd só rodam via cmd.exe, que reinterpreta argumentos —
 * exatamente o vetor de injeção que queremos evitar.
 */
export function detectVSCode(): string | null {
  const configured = getSettings().vscodePath;
  if (configured && fs.existsSync(configured)) return configured;

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    const pf = process.env.ProgramFiles;
    const pf86 = process.env["ProgramFiles(x86)"];
    if (local) candidates.push(path.join(local, "Programs", "Microsoft VS Code", "Code.exe"));
    if (pf) candidates.push(path.join(pf, "Microsoft VS Code", "Code.exe"));
    if (pf86) candidates.push(path.join(pf86, "Microsoft VS Code", "Code.exe"));
    // Instalações em locais customizados: `...\Microsoft VS Code\bin\code.cmd` no PATH.
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
      if (dir && fs.existsSync(path.join(dir, "code.cmd"))) {
        candidates.push(path.resolve(dir, "..", "Code.exe"));
      }
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code");
  } else {
    candidates.push("/usr/bin/code", "/usr/local/bin/code", "/snap/bin/code");
  }

  const found = candidates.find((c) => fs.existsSync(c)) ?? null;
  if (found && found !== configured) updateSettings({ vscodePath: found });
  return found;
}

function cleanEnv(): NodeJS.ProcessEnv {
  // Variáveis do Electron nunca devem vazar para o VS Code (que também é Electron).
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  return env;
}

export async function openInVSCode(targetPath: string): Promise<void> {
  const resolved = assertPathAllowedAndExists(targetPath);
  const exe = detectVSCode();
  if (!exe) throw new Error("VS Code não encontrado. Informe o caminho do Code.exe em Configurações.");
  await spawnDetached(exe, [resolved], { env: cleanEnv() });
  log.info("VS Code aberto");
}

export function setVSCodePath(exePath: string): string {
  const resolved = path.resolve(exePath);
  const base = path.basename(resolved).toLowerCase();
  if (!fs.existsSync(resolved) || !["code.exe", "code", "code - insiders.exe", "cursor.exe"].includes(base)) {
    throw new Error("Selecione o executável do VS Code (Code.exe).");
  }
  updateSettings({ vscodePath: resolved });
  return resolved;
}

// --- Explorer / arquivos ----------------------------------------------------------

/** Extensões que o Windows EXECUTA ao abrir — nunca abrimos direto, só revelamos no Explorer. */
const EXECUTABLE_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".msp", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse",
  ".wsf", ".wsh", ".scr", ".lnk", ".hta", ".reg", ".jar", ".cpl", ".pif", ".url", ".appref-ms", ".application",
]);

export async function openInExplorer(targetPath: string): Promise<void> {
  const resolved = assertPathAllowedAndExists(targetPath);
  if (fs.statSync(resolved).isDirectory()) {
    const error = await shell.openPath(resolved);
    if (error) throw new Error(error);
  } else {
    shell.showItemInFolder(resolved);
  }
}

export async function openFile(targetPath: string): Promise<void> {
  const resolved = assertPathAllowedAndExists(targetPath);
  if (EXECUTABLE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    // Abrir um executável o rodaria; por segurança só mostramos no Explorer.
    shell.showItemInFolder(resolved);
    return;
  }
  const error = await shell.openPath(resolved);
  if (error) throw new Error(error);
}

// --- Terminal externo --------------------------------------------------------------

export async function openTerminal(targetPath: string, shellOverride?: "powershell" | "cmd"): Promise<void> {
  const resolved = assertPathAllowedAndExists(targetPath);
  if (!fs.statSync(resolved).isDirectory()) throw new Error("Selecione uma pasta para abrir o terminal.");
  const terminal = shellOverride ?? getSettings().defaultTerminal;

  if (process.platform === "win32") {
    // A pasta é passada APENAS como `cwd` do processo — nunca dentro de um
    // comando (ex.: `cd /d <pasta>`), para que um nome de pasta com `&` ou `'`
    // não possa injetar comandos.
    const command = terminal === "cmd" ? EXTERNAL_COMMANDS.cmd : EXTERNAL_COMMANDS.powershell;
    const args = terminal === "cmd" ? [] : ["-NoLogo"];
    await spawnDetached(command, args, { cwd: resolved });
  } else if (process.platform === "darwin") {
    await spawnDetached("open", ["-a", "Terminal", resolved]);
  } else {
    await spawnDetached("x-terminal-emulator", [], { cwd: resolved });
  }
}

// --- URLs externas / apps -----------------------------------------------------------

export async function openExternalUrl(url: string): Promise<void> {
  if (!isProtocolAllowed(url)) {
    throw new Error("Endereço não permitido (apenas http, https, mailto e tel).");
  }
  await shell.openExternal(url);
}

/** Normaliza um telefone brasileiro/internacional para o formato do wa.me (só dígitos, com DDI). */
export function normalizeWhatsAppNumber(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Número brasileiro sem DDI (10 ou 11 dígitos com DDD): prefixa 55.
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 11 || digits.length > 15) {
    throw new Error("Número de WhatsApp inválido. Use DDD + número (ex.: 11 91234-5678).");
  }
  return digits;
}

/** URL oficial de "clique para conversar" do WhatsApp. */
export function buildWhatsAppUrl(phone: string, message?: string): string {
  const base = `https://wa.me/${normalizeWhatsAppNumber(phone)}`;
  return message?.trim() ? `${base}?text=${encodeURIComponent(message.trim())}` : base;
}

export function isWhatsAppDesktopInstalled(): boolean {
  try {
    return Boolean(app.getApplicationNameForProtocol("whatsapp://"));
  } catch {
    return false;
  }
}

export async function openWhatsApp(target: "desktop" | "web"): Promise<void> {
  if (target === "desktop") {
    if (!isWhatsAppDesktopInstalled()) throw new Error("WhatsApp Desktop não está instalado. Use o WhatsApp Web.");
    await shell.openExternal("whatsapp://");
  } else {
    await shell.openExternal("https://web.whatsapp.com/");
  }
}

export async function openWhatsAppChat(phone: string, message: string | undefined, preferDesktop: boolean): Promise<void> {
  const digits = normalizeWhatsAppNumber(phone);
  if (preferDesktop && isWhatsAppDesktopInstalled()) {
    const text = message?.trim() ? `&text=${encodeURIComponent(message.trim())}` : "";
    await shell.openExternal(`whatsapp://send?phone=${digits}${text}`);
    return;
  }
  await shell.openExternal(buildWhatsAppUrl(digits, message));
}

export async function openSpotifyApp(): Promise<void> {
  try {
    if (app.getApplicationNameForProtocol("spotify:")) {
      await shell.openExternal("spotify:");
      return;
    }
  } catch {
    // cai no player web
  }
  await shell.openExternal("https://open.spotify.com/");
}

// --- Diálogos nativos ---------------------------------------------------------------

export async function pickDirectory(win: BrowserWindow | null, title = "Escolher pasta"): Promise<string | null> {
  const options = { title, properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[] };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

export async function pickExecutable(win: BrowserWindow | null): Promise<string | null> {
  const options = {
    title: "Localizar VS Code",
    properties: ["openFile"] as "openFile"[],
    filters: process.platform === "win32" ? [{ name: "Executável", extensions: ["exe"] }] : [],
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

// --- Inicialização com o Windows ----------------------------------------------------

export function applyStartWithSystem(enabled: boolean): void {
  if (!app.isPackaged) return; // em dev registraria o electron.exe cru — não faz sentido
  app.setLoginItemSettings({ openAtLogin: enabled, args: ["--hidden"] });
}
