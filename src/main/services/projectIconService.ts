import { app, dialog, nativeImage, type BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { assertPathAllowed } from "../security/paths.js";
import { tt } from "../i18n.js";
import type { ProjectIconMode } from "../../shared/types.js";

/**
 * Ícone dos projetos. No modo "auto" o Qyrex procura na pasta do projeto o ícone
 * ou logo do app (build/icon.png, public/favicon.svg, assets/icon.png...). No modo
 * "custom" usa uma imagem escolhida pelo usuário no seletor nativo, guardada em
 * <userData>/project-icons/<id>.png. Para a interface vai sempre como data URL.
 */

/** Lado máximo do ícone entregue à interface (os cards mostram 30–34 px; 96 cobre telas 2x/3x). */
export const PROJECT_ICON_SIZE = 96;
const RASTER_MAX_BYTES = 10 * 1024 * 1024;
const SVG_MAX_BYTES = 512 * 1024;
const RASTER_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico"];
const PICK_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico"];

/** Caminhos conhecidos, em ordem de preferência (ícone do app antes de favicon pequeno). */
const KNOWN_ICON_FILES = [
  // Electron / electron-builder
  "build/icon.png",
  "build/icon.svg",
  "build/icon.ico",
  "resources/icon.png",
  // Tauri
  "src-tauri/icons/icon.png",
  "src-tauri/icons/128x128@2x.png",
  "src-tauri/icons/128x128.png",
  // Expo / React Native
  "assets/icon.png",
  "assets/images/icon.png",
  "assets/adaptive-icon.png",
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
  // Next.js (app router)
  "src/app/icon.png",
  "src/app/icon.svg",
  "app/icon.png",
  "app/icon.svg",
  "src/app/apple-icon.png",
  "app/apple-icon.png",
  // Web (Vite, CRA, Next, SvelteKit, Flutter web)
  "public/apple-touch-icon.png",
  "public/android-chrome-512x512.png",
  "public/logo512.png",
  "public/icon.png",
  "public/icon.svg",
  "public/logo.png",
  "public/logo.svg",
  "public/logo192.png",
  "public/favicon.svg",
  "public/favicon.png",
  "static/logo.png",
  "static/favicon.png",
  "web/icons/Icon-512.png",
  "web/favicon.png",
  // Pastas comuns de assets e a raiz
  "assets/logo.png",
  "assets/logo.svg",
  "src/assets/icon.png",
  "src/assets/logo.png",
  "src/assets/logo.svg",
  "icon.png",
  "icon.svg",
  "logo.png",
  "logo.svg",
  // Favicons .ico por último (costumam ser 16–48 px)
  "public/favicon.ico",
  "src/app/favicon.ico",
  "app/favicon.ico",
  "favicon.ico",
  "icon.ico",
];

/** Pastas varridas (sem recursão) quando nenhum caminho conhecido existe. */
const SCAN_DIRS = [".", "public", "assets", "assets/images", "build", "resources", "static", "src/assets", "src", "images", "img", "public/images", "public/img"];
const ICON_NAME = /^(app[-_]?)?(icon|logo|favicon)([-_.@]?[\w-]*)?$/i;

function isImageFile(file: string): boolean {
  const ext = path.extname(file).slice(1).toLowerCase();
  return ext === "svg" || RASTER_EXTENSIONS.includes(ext);
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** Configs maiores que isso nem são lidas (package.json normal tem poucos KB). */
const CONFIG_MAX_BYTES = 1024 * 1024;

/**
 * Ícone apontado na configuração do projeto (package.json "build.icon" do electron-builder, app.json do Expo).
 * `inside` garante que o próprio arquivo de config não é um link para fora da pasta.
 */
function configuredIcons(root: string, inside: (file: string) => string | null): string[] {
  const found: string[] = [];
  const readJson = (file: string): Record<string, unknown> | null => {
    try {
      const real = inside(path.join(root, file));
      if (!real) return null;
      const stat = fs.statSync(real);
      if (!stat.isFile() || stat.size > CONFIG_MAX_BYTES) return null;
      return JSON.parse(fs.readFileSync(real, "utf-8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const pick = (value: unknown) => {
    if (typeof value === "string" && value.length < 300) found.push(value);
  };
  const pkg = readJson("package.json");
  const build = pkg?.build as Record<string, unknown> | undefined;
  pick(build?.icon);
  pick((build?.win as Record<string, unknown> | undefined)?.icon);
  pick(pkg?.icon);
  const expo = readJson("app.json")?.expo as Record<string, unknown> | undefined;
  pick(expo?.icon);
  // O electron-builder aceita "build/icon" sem extensão: tenta as variações.
  return found.flatMap((rel) => (path.extname(rel) ? [rel] : [`${rel}.png`, `${rel}.ico`, `${rel}.svg`]));
}

/** Pontua candidatos achados na varredura: nome "icon" > "logo" > "favicon", PNG/SVG > ICO, arquivo maior (mais resolução). */
function scanScore(file: string, size: number): number {
  const base = path.basename(file, path.extname(file)).toLowerCase();
  const ext = path.extname(file).slice(1).toLowerCase();
  let score = base.includes("favicon") ? 0 : base.includes("logo") ? 200 : 300;
  score += ext === "svg" || ext === "png" ? 50 : ext === "ico" ? 0 : 25;
  return score + Math.min(size / 1024, 100) / 10;
}

/**
 * Candidatos a ícone/logo dentro da pasta do projeto, do melhor para o pior.
 * Cada caminho é resolvido (symlinks/junctions) e precisa continuar dentro da
 * pasta ANTES de ser lido; o que sai dela é ignorado.
 */
export function findProjectIconFiles(projectPath: string): string[] {
  const root = path.resolve(projectPath);
  let realRoot: string;
  try {
    realRoot = fs.realpathSync.native(root);
  } catch {
    return [];
  }
  const inside = (file: string): string | null => {
    try {
      const real = fs.realpathSync.native(file);
      const rel = path.relative(realRoot, real);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)) ? real : null;
    } catch {
      return null;
    }
  };

  const result: string[] = [];
  const add = (real: string) => {
    if (!result.includes(real)) result.push(real);
  };

  for (const rel of [...configuredIcons(root, inside), ...KNOWN_ICON_FILES]) {
    const file = path.resolve(root, rel);
    if (!isImageFile(file)) continue;
    const real = inside(file);
    if (real && real !== realRoot && isFile(real)) add(real);
  }

  const scanned: { file: string; score: number }[] = [];
  for (const dir of SCAN_DIRS) {
    const realDir = inside(path.join(root, dir));
    if (!realDir) continue;
    let names: string[];
    try {
      names = fs.readdirSync(realDir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!isImageFile(name) || !ICON_NAME.test(path.basename(name, path.extname(name)))) continue;
      const real = inside(path.join(realDir, name));
      if (!real || !isFile(real)) continue;
      scanned.push({ file: real, score: scanScore(real, fs.statSync(real).size) });
    }
  }
  scanned.sort((a, b) => b.score - a.score).forEach((c) => add(c.file));
  return result;
}

/** O melhor candidato (ou null). */
export function findProjectIconFile(projectPath: string): string | null {
  return findProjectIconFiles(projectPath)[0] ?? null;
}

/** Reduz a imagem para caber em size×size, mantendo a proporção. */
export function fitInside(width: number, height: number, size: number): { width: number; height: number } {
  const scale = Math.min(1, size / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Converte o arquivo em data URL pequena. SVG vai como está (num <img> ele não roda script). */
function imageToDataUrl(file: string): string | null {
  const ext = path.extname(file).slice(1).toLowerCase();
  const size = fs.statSync(file).size;
  if (ext === "svg") {
    if (size > SVG_MAX_BYTES) return null;
    return `data:image/svg+xml;base64,${fs.readFileSync(file).toString("base64")}`;
  }
  if (size > RASTER_MAX_BYTES) return null;
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  const resized = image.resize({ ...fitInside(width, height, PROJECT_ICON_SIZE), quality: "best" });
  return resized.toDataURL();
}

// Cache por arquivo + mtime + tamanho: a lista de projetos é recarregada com frequência.
const cache = new Map<string, string | null>();

function cachedDataUrl(file: string): string | null {
  let key: string;
  try {
    const stat = fs.statSync(file);
    key = `${file}|${stat.mtimeMs}|${stat.size}`;
  } catch {
    return null;
  }
  if (cache.has(key)) return cache.get(key) ?? null;
  let url: string | null = null;
  try {
    url = imageToDataUrl(file);
  } catch {
    url = null;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, url);
  return url;
}

/** Ícone detectado na pasta (usado também no diálogo "Novo projeto"). */
export function detectProjectIcon(projectPath: string): string | null {
  try {
    assertPathAllowed(projectPath);
    // Se o melhor candidato estiver corrompido ou grande demais, tenta o próximo.
    for (const file of findProjectIconFiles(projectPath)) {
      const url = cachedDataUrl(file);
      if (url) return url;
    }
    return null;
  } catch {
    return null; // pasta removida ou fora da allowlist atual
  }
}

function customIconFile(projectId: string): string {
  // O id vira nome de arquivo: só caracteres seguros (ids são UUID), nunca "../".
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(projectId)) throw new Error("Projeto inválido.");
  return path.join(app.getPath("userData"), "project-icons", `${projectId}.png`);
}

/** Ícone que a interface mostra para o projeto, conforme o modo. */
export function resolveProjectIcon(project: { id: string; localPath: string; iconMode: ProjectIconMode }): string | null {
  if (project.iconMode === "none") return null;
  if (project.iconMode === "custom") {
    try {
      return cachedDataUrl(customIconFile(project.id));
    } catch {
      return null;
    }
  }
  return detectProjectIcon(project.localPath);
}

/**
 * Abre o seletor de imagens (começando na pasta do projeto) e salva a escolha
 * como PNG reduzido. Devolve `false` se o usuário cancelar.
 */
export async function pickCustomIcon(win: BrowserWindow | null, projectId: string, projectPath: string): Promise<boolean> {
  const options = {
    title: tt("Escolher ícone do projeto"),
    defaultPath: projectPath,
    properties: ["openFile"] as "openFile"[],
    filters: [{ name: tt("Imagens"), extensions: PICK_EXTENSIONS }],
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return false;
  const source = result.filePaths[0];

  const ext = path.extname(source).slice(1).toLowerCase();
  if (!PICK_EXTENSIONS.includes(ext)) throw new Error(tt("Escolha uma imagem PNG, JPG, WebP, GIF, BMP ou ICO."));
  if (fs.statSync(source).size > RASTER_MAX_BYTES) throw new Error(tt("A imagem passa de 10 MB. Escolha uma menor."));

  const image = nativeImage.createFromPath(source);
  if (image.isEmpty()) throw new Error(tt("Não foi possível ler essa imagem."));
  const { width, height } = image.getSize();
  const resized = image.resize({ ...fitInside(width, height, PROJECT_ICON_SIZE), quality: "best" });

  const target = customIconFile(projectId);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, resized.toPNG());
  return true;
}

export function removeCustomIcon(projectId: string): void {
  fs.rmSync(customIconFile(projectId), { force: true });
}
