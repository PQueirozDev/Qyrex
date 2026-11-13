import type { DirEntry } from "@shared/types";

/** Identidade visual de caminhos; a autorização continua sendo conferida no main. */
export function filePathKey(path: string): string {
  const windows = /^[a-z]:[\\/]|^\\\\/i.test(path);
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  return windows ? normalized.toLowerCase() : normalized;
}

export function isWithinFileRoot(path: string, root: string): boolean {
  const p = filePathKey(path);
  const r = filePathKey(root);
  return p === r || p.startsWith(r === "/" ? r : `${r}/`);
}

export function authorizedFileRoot(path: string, roots: readonly string[]): string | null {
  return roots.filter((root) => isWithinFileRoot(path, root)).sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Uma raiz já coberta por outra aparece na própria hierarquia, sem repetir a árvore. */
export function compactFileRoots(roots: readonly string[]): string[] {
  const unique = roots.filter((root, i) => roots.findIndex((other) => filePathKey(other) === filePathKey(root)) === i);
  return unique.filter((root) => !unique.some((other) => filePathKey(root) !== filePathKey(other) && isWithinFileRoot(root, other)));
}

/** Só os ancestrais do destino: nunca varre os irmãos ou as subpastas deles. */
export function fileAncestors(root: string, directory: string): string[] {
  if (!isWithinFileRoot(directory, root)) return [];
  const base = root.replace(/[\\/]+$/, "");
  const separator = root.includes("\\") ? "\\" : "/";
  const parts = directory.slice(base.length).split(/[\\/]/).filter(Boolean);
  const paths = [root];
  let path = base;
  for (const part of parts) {
    path += separator + part;
    paths.push(path);
  }
  return paths;
}

export interface FileTreeRow {
  key: string;
  entry: DirEntry;
  depth: number;
  parentKey: string | null;
  position: number;
  siblings: number;
}

export function visibleFileRows(
  roots: readonly DirEntry[],
  expanded: ReadonlySet<string>,
  children: ReadonlyMap<string, readonly DirEntry[]>
): FileTreeRow[] {
  const rows: FileTreeRow[] = [];
  const append = (entries: readonly DirEntry[], depth: number, parentKey: string | null, ancestors: ReadonlySet<string>) => {
    const unique = entries.filter((entry, i) => !ancestors.has(filePathKey(entry.path)) && entries.findIndex((other) => filePathKey(other.path) === filePathKey(entry.path)) === i);
    unique.forEach((entry, index) => {
      const key = filePathKey(entry.path);
      rows.push({ key, entry, depth, parentKey, position: index + 1, siblings: unique.length });
      if (entry.isDirectory && expanded.has(key)) append(children.get(key) ?? [], depth + 1, key, new Set([...ancestors, key]));
    });
  };
  append(roots, 0, null, new Set());
  return rows;
}

/** Movimentação do foco sobre a árvore visível, inclusive pastas ainda não carregadas. */
export function fileTreeKeyAction(rows: readonly FileTreeRow[], focused: string, key: string, expanded: ReadonlySet<string>): { focus?: string; expand?: string; collapse?: string } {
  const index = rows.findIndex((row) => row.key === focused);
  const row = rows[index];
  if (!row) return {};
  if (key === "ArrowDown") return { focus: rows[Math.min(rows.length - 1, index + 1)]?.key };
  if (key === "ArrowUp") return { focus: rows[Math.max(0, index - 1)]?.key };
  if (key === "Home") return { focus: rows[0]?.key };
  if (key === "End") return { focus: rows[rows.length - 1]?.key };
  if (key === "ArrowRight" && row.entry.isDirectory) {
    if (!expanded.has(row.key)) return { expand: row.key };
    return rows[index + 1]?.parentKey === row.key ? { focus: rows[index + 1].key } : {};
  }
  if (key === "ArrowLeft") {
    if (row.entry.isDirectory && expanded.has(row.key)) return { collapse: row.key };
    return row.parentKey ? { focus: row.parentKey } : {};
  }
  return {};
}
