import fs from "node:fs";
import path from "node:path";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { getProject } from "./projectService.js";
import { getRecentCommits, getWeeklyCommits } from "./gitService.js";
import type { ProjectInsights, ProjectLanguage } from "../../shared/types.js";
import { tm } from "../../shared/i18n.js";

/**
 * Resumo do projeto para os cards: linguagens (por bytes de código, como o
 * GitHub), atividade de commits por semana e o último commit.
 * Só lê nomes e tamanhos de arquivos (nunca o conteúdo) e com limites, para
 * uma pasta enorme não travar o app. Cache curto por projeto.
 */

/** Extensão → linguagem e cor (cores do GitHub Linguist). */
const LANGUAGES: Record<string, { name: string; color: string }> = {};
const add = (name: string, color: string, exts: string[]) => exts.forEach((e) => (LANGUAGES[e] = { name, color }));
add("TypeScript", "#3178c6", [".ts", ".tsx", ".mts", ".cts"]);
add("JavaScript", "#f1e05a", [".js", ".jsx", ".mjs", ".cjs"]);
add("Python", "#3572a5", [".py"]);
add("Go", "#00add8", [".go"]);
add("Rust", "#dea584", [".rs"]);
add("Java", "#b07219", [".java"]);
add("Kotlin", "#a97bff", [".kt", ".kts"]);
add("C#", "#178600", [".cs"]);
add("C++", "#f34b7d", [".cpp", ".cc", ".cxx", ".hpp", ".hh"]);
add("C", "#555555", [".c", ".h"]);
add("PHP", "#4f5d95", [".php"]);
add("Ruby", "#701516", [".rb"]);
add("Swift", "#f05138", [".swift"]);
add("Dart", "#00b4ab", [".dart"]);
add("Lua", "#000080", [".lua"]);
add("Shell", "#89e051", [".sh", ".bash"]);
add("PowerShell", "#012456", [".ps1", ".psm1"]);
add("HTML", "#e34c26", [".html", ".htm"]);
add("CSS", "#663399", [".css"]);
add("SCSS", "#c6538c", [".scss", ".sass"]);
add("Vue", "#41b883", [".vue"]);
add("Svelte", "#ff3e00", [".svelte"]);
add("Astro", "#ff5a03", [".astro"]);
add("SQL", "#e38c00", [".sql"]);
add("Elixir", "#6e4a7e", [".ex", ".exs"]);
add("Zig", "#ec915c", [".zig"]);

/** Pastas que nunca entram na conta (dependências, builds, caches). */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist-electron",
  "dist-demo",
  "build",
  "out",
  "release",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  "coverage",
  "vendor",
  "target",
  "bin",
  "obj",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
]);

const MAX_FILES = 8000;
const MAX_DEPTH = 8;
const CACHE_MS = 5 * 60_000;

/** Soma bytes por linguagem. Exportado para testes. */
export function scanLanguages(root: string): ProjectLanguage[] {
  const bytes = new Map<string, number>();
  let files = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > MAX_DEPTH || files >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files >= MAX_FILES) return;
      // Links simbólicos/junctions ficam de fora: poderiam apontar para fora do projeto.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) walk(path.join(dir, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const lang = LANGUAGES[path.extname(entry.name).toLowerCase()];
      if (!lang || entry.name.endsWith(".min.js") || entry.name.endsWith(".d.ts")) continue;
      files++;
      try {
        const size = fs.statSync(path.join(dir, entry.name)).size;
        bytes.set(lang.name, (bytes.get(lang.name) ?? 0) + size);
      } catch {
        // arquivo sumiu no meio da varredura
      }
    }
  };
  walk(root, 0);
  const total = [...bytes.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const colorOf = (name: string) => Object.values(LANGUAGES).find((l) => l.name === name)?.color ?? "#8b8b8b";
  const sorted = [...bytes.entries()].sort((a, b) => b[1] - a[1]).map(([name, b]) => ({ name, color: colorOf(name), percent: (b / total) * 100 }));
  // Até 5 linguagens; o resto vira "Outras" (só se tiver peso visível).
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5).reduce((a, l) => a + l.percent, 0);
  if (rest >= 0.5) top.push({ name: tm("Outras"), color: "#8b8b8b", percent: rest });
  return top.map((l) => ({ ...l, percent: Math.round(l.percent * 10) / 10 }));
}

const cache = new Map<string, { at: number; value: ProjectInsights }>();

export async function getProjectInsights(projectId: string): Promise<ProjectInsights> {
  const project = getProject(projectId);
  if (!project) throw new Error("Projeto não encontrado.");
  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const dir = assertPathAllowedAndExists(project.localPath);
  const [weeklyCommits, commits] = await Promise.all([
    getWeeklyCommits(dir, 12).catch(() => new Array<number>(12).fill(0)),
    getRecentCommits(dir, 1).catch(() => []),
  ]);
  const value: ProjectInsights = { languages: scanLanguages(dir), weeklyCommits, lastCommit: commits[0] ?? null };
  cache.set(projectId, { at: Date.now(), value });
  return value;
}

/** Depois de um commit/pull, o card mostra o novo estado na hora. */
export function invalidateInsights(projectId?: string): void {
  if (projectId) cache.delete(projectId);
  else cache.clear();
}
