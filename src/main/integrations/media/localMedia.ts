import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createLogger } from "../../logger.js";
import type { LocalMediaState, MediaAction } from "../../../shared/types.js";
import { MEDIA_SESSION_SCRIPT } from "./mediaScript.js";

/**
 * Música tocando no PC (Spotify desktop ou outro player) pelas sessões de mídia
 * do Windows — a mesma fonte do painel de mídia do Windows. Não precisa de
 * conta de desenvolvedor, OAuth nem Premium.
 *
 * Um único PowerShell fica aberto em segundo plano (script fixo, embutido) e
 * recebe só comandos de uma lista fechada pelo stdin; nada vindo da UI vira
 * código ou argumento de linha de comando.
 */

const log = createLogger("media");
const POWERSHELL = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const ACTIONS: ReadonlySet<string> = new Set(["play", "pause", "toggle", "next", "previous"]);

let child: ChildProcessWithoutNullStreams | null = null;
let buffer = "";
const waiting: ((line: string | null) => void)[] = [];
let queue: Promise<unknown> = Promise.resolve();

/**
 * Grava o script fixo em <userData>/media-bridge.ps1 (reescrito a cada abertura,
 * sempre com o conteúdo embutido) e devolve o caminho. Não usamos -EncodedCommand:
 * o antivírus inspeciona comandos codificados na criação do processo e o spawn
 * (síncrono no Windows) travava o processo principal por 3–5 s, atrasando a
 * janela na abertura do app.
 */
let scriptPath: string | null = null;
function bridgeScript(): string {
  if (!scriptPath) {
    const target = path.join(app.getPath("userData"), "media-bridge.ps1");
    // BOM: o PowerShell 5.1 lê .ps1 sem BOM como ANSI.
    fs.writeFileSync(target, "﻿" + MEDIA_SESSION_SCRIPT, "utf8");
    scriptPath = target;
  }
  return scriptPath;
}

function start(): ChildProcessWithoutNullStreams {
  if (child && !child.killed && child.exitCode === null) return child;
  const proc = spawn(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", bridgeScript()], {
    shell: false,
    windowsHide: true,
  });
  buffer = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) waiting.shift()?.(line);
  });
  proc.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    // O PowerShell escreve progresso em CLIXML no stderr; não é erro.
    if (!text.includes("CLIXML")) log.warn("ponte de mídia:", text.slice(0, 300));
  });
  proc.on("exit", () => {
    child = null;
    while (waiting.length) waiting.shift()?.(null);
  });
  proc.on("error", (err) => log.warn("ponte de mídia não iniciou:", err.message));
  child = proc;
  return proc;
}

/** Envia um comando e espera a linha de resposta (serializado: um de cada vez). */
function request(command: string, timeoutMs = 8000): Promise<Record<string, unknown> | null> {
  const run = () =>
    new Promise<Record<string, unknown> | null>((resolve) => {
      const proc = start();
      let done = false;
      const finish = (line: string | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (line === null) return resolve(null);
        try {
          resolve(JSON.parse(line) as Record<string, unknown>);
        } catch {
          resolve(null);
        }
      };
      const timer = setTimeout(() => {
        // Travou: descarta o processo; o próximo pedido abre outro.
        const i = waiting.indexOf(finish);
        if (i >= 0) waiting.splice(i, 1);
        proc.kill();
        finish(null);
      }, timeoutMs);
      waiting.push(finish);
      proc.stdin.write(`${command}\n`, "utf8");
    });
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

// --- Capa do álbum -----------------------------------------------------------------------

const covers = new Map<string, string | null>();

/** URL da capa nos catálogos públicos da Deezer e do iTunes (sem chave), nessa ordem. */
async function coverUrlFor(title: string, artist: string, album: string): Promise<string | null> {
  const q = [artist, title].filter(Boolean).join(" ");
  try {
    const res = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: "1" }).toString()}`, { signal: AbortSignal.timeout(6000) });
    const body = (await res.json()) as { data?: { album?: { cover_medium?: string } }[] };
    const art = body.data?.[0]?.album?.cover_medium;
    if (art && /^https:\/\/[\w.-]+\.dzcdn\.net\//.test(art)) return art;
  } catch {
    // tenta o iTunes
  }
  try {
    const term = [artist, album || title].filter(Boolean).join(" ");
    const res = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term, entity: album ? "album" : "song", limit: "1" }).toString()}`, {
      signal: AbortSignal.timeout(6000),
    });
    const body = (await res.json()) as { results?: { artworkUrl100?: string }[] };
    const art = body.results?.[0]?.artworkUrl100;
    if (art && /^https:\/\/[\w.-]+\.mzstatic\.com\//.test(art)) return art.replace(/\/\d+x\d+bb\./, "/300x300bb.");
  } catch {
    // sem capa
  }
  return null;
}

/** Capa da faixa como data URL (a CSP não libera domínios de imagem externos). Cache por faixa. */
async function findCover(title: string, artist: string, album: string): Promise<string | null> {
  const key = `${title}|${artist}|${album}`;
  if (covers.has(key)) return covers.get(key) ?? null;
  covers.set(key, null);
  try {
    const art = await coverUrlFor(title, artist, album);
    if (!art) return null;
    const img = await fetch(art, { signal: AbortSignal.timeout(6000) });
    const type = img.headers.get("content-type") ?? "";
    if (!img.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const bytes = Buffer.from(await img.arrayBuffer());
    if (bytes.length > 500_000) return null;
    const data = `data:${type};base64,${bytes.toString("base64")}`;
    covers.set(key, data);
    if (covers.size > 200) covers.delete(covers.keys().next().value as string);
    return data;
  } catch {
    return null;
  }
}

// --- API ----------------------------------------------------------------------------------

export async function getLocalMedia(): Promise<LocalMediaState | null> {
  if (process.platform !== "win32") return null;
  const r = await request("state");
  if (!r || r.active !== true || typeof r.title !== "string" || !r.title) return null;
  const title = String(r.title);
  const artist = String(r.artist ?? "");
  const album = String(r.album ?? "");
  return {
    app: String(r.app ?? ""),
    isSpotify: /spotify/i.test(String(r.app ?? "")),
    title,
    artist,
    album,
    isPlaying: r.isPlaying === true,
    positionMs: Number(r.positionMs) || 0,
    durationMs: Number(r.durationMs) || 0,
    canNext: r.canNext === true,
    canPrevious: r.canPrev === true,
    canSeek: r.canSeek === true,
    coverUrl: await findCover(title, artist, album),
  };
}

export async function controlLocalMedia(action: MediaAction): Promise<void> {
  if (!ACTIONS.has(action)) throw new Error("Ação de mídia inválida.");
  const r = await request(action);
  if (!r || r.ok !== true) throw new Error("O player não aceitou o comando.");
}

export async function seekLocalMedia(positionMs: number): Promise<void> {
  const ms = Math.max(0, Math.round(positionMs));
  const r = await request(`seek ${ms}`);
  if (!r || r.ok !== true) throw new Error("O player não aceitou o comando.");
}

export function stopLocalMedia(): void {
  child?.kill();
  child = null;
}
