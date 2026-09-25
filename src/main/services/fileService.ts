import fs from "node:fs";
import path from "node:path";
import {
  assertPathAllowed,
  assertPathAllowedAndExists,
  assertSafeName,
  getAllowedDirs,
  isWithin,
} from "../security/paths.js";
import type { DirEntry, FilePreview } from "../../shared/types.js";
import { tt } from "../i18n.js";

function toEntry(full: string, stat: fs.Stats): DirEntry {
  return {
    name: path.basename(full),
    path: full,
    isDirectory: stat.isDirectory(),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

export function listDir(dirPath: string): DirEntry[] {
  const resolved = assertPathAllowedAndExists(dirPath);
  if (!fs.statSync(resolved).isDirectory()) throw new Error("O caminho não é uma pasta.");
  const entries: DirEntry[] = [];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    const full = path.join(resolved, entry.name);
    try {
      entries.push(toEntry(full, fs.statSync(full)));
    } catch {
      // Arquivo bloqueado/sem permissão (ex.: pagefile, link quebrado): ignora.
    }
  }
  return entries.sort((a, b) =>
    a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name, "pt-BR") : a.isDirectory ? -1 : 1
  );
}

export function createFolder(dirPath: string, name: string): DirEntry {
  const parent = assertPathAllowedAndExists(dirPath);
  const target = path.join(parent, assertSafeName(name));
  assertPathAllowed(target); // garante que o novo caminho ainda cai dentro da allowlist
  if (fs.existsSync(target)) throw new Error("Já existe um item com esse nome.");
  fs.mkdirSync(target);
  return toEntry(target, fs.statSync(target));
}

export function renameEntry(oldPath: string, newName: string): string {
  const resolvedOld = assertPathAllowedAndExists(oldPath);
  if (getAllowedDirs().some((root) => path.resolve(root) === resolvedOld)) {
    throw new Error("Não é possível renomear um diretório autorizado raiz.");
  }
  const newPath = path.join(path.dirname(resolvedOld), assertSafeName(newName));
  assertPathAllowed(newPath);
  if (fs.existsSync(newPath) && newPath.toLowerCase() !== resolvedOld.toLowerCase()) {
    throw new Error("Já existe um item com esse nome.");
  }
  fs.renameSync(resolvedOld, newPath);
  return newPath;
}

function uniqueDestination(destDir: string, name: string): string {
  let candidate = path.join(destDir, name);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  for (let i = 1; i < 1000; i++) {
    candidate = path.join(destDir, `${base} (${i > 1 ? tt("cópia {n}", { n: i }) : tt("cópia")})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Não foi possível gerar um nome de destino livre.");
}

function assertNotIntoItself(source: string, destDir: string): void {
  if (isWithin(source, destDir)) throw new Error("Não é possível copiar/mover uma pasta para dentro dela mesma.");
}

export function copyEntry(sourcePath: string, destDir: string): string {
  const source = assertPathAllowedAndExists(sourcePath);
  const dest = assertPathAllowedAndExists(destDir);
  if (!fs.statSync(dest).isDirectory()) throw new Error("O destino precisa ser uma pasta.");
  assertNotIntoItself(source, dest);
  const target = uniqueDestination(dest, path.basename(source));
  assertPathAllowed(target);
  fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
  return target;
}

/** Ação sensível: requer confirmação no renderer (validada no handler IPC). */
export function moveEntry(sourcePath: string, destDir: string): string {
  const source = assertPathAllowedAndExists(sourcePath);
  const dest = assertPathAllowedAndExists(destDir);
  if (getAllowedDirs().some((root) => path.resolve(root) === source)) {
    throw new Error("Não é possível mover um diretório autorizado raiz.");
  }
  if (!fs.statSync(dest).isDirectory()) throw new Error("O destino precisa ser uma pasta.");
  assertNotIntoItself(source, dest);
  const target = path.join(dest, path.basename(source));
  assertPathAllowed(target);
  if (fs.existsSync(target)) throw new Error("Já existe um item com esse nome no destino.");
  try {
    fs.renameSync(source, target);
  } catch (err) {
    // Entre unidades diferentes rename falha (EXDEV): copia e remove a origem.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
    fs.rmSync(source, { recursive: true });
  }
  return target;
}

/** Ação sensível: requer confirmação no renderer (validada no handler IPC). */
export function deleteEntry(targetPath: string): void {
  const resolved = assertPathAllowedAndExists(targetPath);
  if (getAllowedDirs().some((root) => path.resolve(root) === resolved)) {
    throw new Error("Um diretório autorizado raiz não pode ser excluído pelo QrzSpace.");
  }
  fs.rmSync(resolved, { recursive: true, force: false });
}

// --- Preview -------------------------------------------------------------------

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".markdown": "markdown",
  ".html": "xml",
  ".htm": "xml",
  ".xml": "xml",
  ".css": "css",
  ".scss": "scss",
  ".py": "python",
  ".php": "php",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".sql": "sql",
  ".sh": "bash",
  ".ps1": "powershell",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".txt": "plaintext",
  ".env": "plaintext",
  ".log": "plaintext",
};

export function languageFor(filePath: string): string {
  return LANGUAGE_BY_EXT[path.extname(filePath).toLowerCase()] ?? "plaintext";
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
  return sample.includes(0);
}

const MAX_TEXT_PREVIEW = 512 * 1024;
const MAX_IMAGE_PREVIEW = 8 * 1024 * 1024;

export function previewFile(filePath: string): FilePreview {
  const resolved = assertPathAllowedAndExists(filePath);
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) throw new Error("Não é possível pré-visualizar uma pasta.");
  const ext = path.extname(resolved).toLowerCase();

  if (IMAGE_MIME[ext]) {
    if (stat.size > MAX_IMAGE_PREVIEW) return { kind: "too_large", size: stat.size };
    const data = fs.readFileSync(resolved).toString("base64");
    return { kind: "image", dataUrl: `data:${IMAGE_MIME[ext]};base64,${data}` };
  }

  const fd = fs.openSync(resolved, "r");
  try {
    const length = Math.min(stat.size, MAX_TEXT_PREVIEW);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    if (looksBinary(buffer)) return { kind: "binary", size: stat.size };
    return {
      kind: "text",
      language: languageFor(resolved),
      content: buffer.toString("utf-8"),
      truncated: stat.size > MAX_TEXT_PREVIEW,
    };
  } finally {
    fs.closeSync(fd);
  }
}

/** Leitura de texto para contexto da IA — só arquivos explicitamente anexados. */
export function readTextFile(filePath: string, maxBytes = 100_000): string {
  const preview = previewFile(filePath);
  if (preview.kind === "text") {
    const content = preview.content.length > maxBytes ? preview.content.slice(0, maxBytes) : preview.content;
    const truncated = preview.truncated || preview.content.length > maxBytes;
    return truncated ? `${content}\n[... arquivo truncado ...]` : content;
  }
  if (preview.kind === "image") return "[imagem — conteúdo binário não enviado]";
  return `[arquivo binário ou grande demais (${preview.size} bytes) — não enviado]`;
}

// --- Busca ------------------------------------------------------------------------

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "release", "dist-electron", "__pycache__", ".venv", "vendor"]);

/**
 * Busca por nome dentro dos diretórios autorizados (ou de um deles).
 * Limitada em profundidade, quantidade de resultados e itens visitados, para
 * nunca travar o app em pastas gigantes.
 */
export function searchFiles(query: string, root?: string, limit = 50): DirEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const roots = root ? [assertPathAllowedAndExists(root)] : getAllowedDirs().filter((d) => fs.existsSync(d));
  const results: DirEntry[] = [];
  let visited = 0;
  const MAX_VISITED = 20_000;
  const MAX_DEPTH = 6;

  const walk = (dir: string, depth: number) => {
    if (results.length >= limit || visited >= MAX_VISITED || depth > MAX_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= limit || visited >= MAX_VISITED) return;
      visited++;
      const full = path.join(dir, entry.name);
      if (entry.name.toLowerCase().includes(q)) {
        try {
          results.push(toEntry(full, fs.statSync(full)));
        } catch {
          // ignora itens inacessíveis
        }
      }
      if (entry.isDirectory() && !entry.isSymbolicLink() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        walk(full, depth + 1);
      }
    }
  };

  for (const r of roots) walk(r, 0);
  return results;
}
