import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, File, Folder, FolderOpen, HardDrive, Loader2, RotateCcw } from "lucide-react";
import type { DirEntry } from "@shared/types";
import { cn } from "@/lib/cn";
import { errorMessage, unwrap } from "@/lib/api";
import { basename } from "@/lib/format";
import { getLocale, tr } from "@/lib/i18n";
import { authorizedFileRoot, compactFileRoots, fileAncestors, filePathKey, fileTreeKeyAction, visibleFileRows, type FileTreeRow } from "@/lib/filesTree";
import { Button } from "@/components/ui/Button";

type DirectoryState = { status: "loading"; entries?: DirEntry[] } | { status: "ready"; entries: DirEntry[] } | { status: "error"; message: string; entries?: DirEntry[] };

interface FilesTreeProps {
  roots: string[];
  currentPath: string | null;
  selectedPath: string | null;
  refreshKey: number;
  refreshPaths: string[];
  onOpenDirectory: (path: string) => void;
  onOpenFile: (entry: DirEntry) => void;
}

/** Árvore da navegação: mantém só as pastas visitadas; todos os acessos passam pela API autorizada. */
export function FilesTree({ roots, currentPath, selectedPath, refreshKey, refreshPaths, onOpenDirectory, onOpenFile }: FilesTreeProps) {
  const treeRoots = useMemo(() => compactFileRoots(roots), [roots]);
  const rootEntries = useMemo<DirEntry[]>(() => treeRoots.map((path) => ({ path, name: basename(path) || path, isDirectory: true, size: 0, modifiedAt: "" })), [treeRoots]);
  const [directories, setDirectories] = useState<Record<string, DirectoryState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const cache = useRef(new Map<string, DirEntry[]>());
  const pending = useRef(new Map<string, Promise<DirEntry[] | null>>());
  const generation = useRef(0);
  const requests = useRef(new Map<string, number>());
  const items = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const currentGeneration = ++generation.current;
    cache.current.clear();
    pending.current.clear();
    requests.current.clear();
    setDirectories({});
    return () => { generation.current = currentGeneration + 1; };
  }, [treeRoots]);

  const load = useCallback((path: string, retry = false): Promise<DirEntry[] | null> => {
    const key = filePathKey(path);
    if (!authorizedFileRoot(path, treeRoots)) return Promise.resolve(null);
    if (!retry && cache.current.has(key)) return Promise.resolve(cache.current.get(key)!);
    if (!retry && pending.current.has(key)) return pending.current.get(key)!;
    const requestGeneration = generation.current;
    const requestId = (requests.current.get(key) ?? 0) + 1;
    requests.current.set(key, requestId);
    // Revalidar não desmonta os filhos: preserva o foco enquanto a resposta chega.
    setDirectories((state) => ({ ...state, [key]: { status: "loading", entries: state[key]?.entries } }));
    const request = unwrap(window.workspace.files.list(path)).then((entries) => {
      if (generation.current !== requestGeneration || requests.current.get(key) !== requestId) return null;
      const sorted = [...entries].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, getLocale()));
      cache.current.set(key, sorted);
      setDirectories((state) => ({ ...state, [key]: { status: "ready", entries: sorted } }));
      return sorted;
    }).catch((error) => {
      if (generation.current === requestGeneration && requests.current.get(key) === requestId) setDirectories((state) => ({ ...state, [key]: { status: "error", message: errorMessage(error), entries: state[key]?.entries } }));
      return null;
    }).finally(() => {
      if (pending.current.get(key) === request) pending.current.delete(key);
    });
    pending.current.set(key, request);
    return request;
  }, [treeRoots]);

  // Breadcrumbs, busca e atalhos revelam só o caminho até a pasta atual.
  useEffect(() => {
    if (!currentPath) return;
    const root = authorizedFileRoot(currentPath, treeRoots);
    if (!root) return;
    let alive = true;
    const chain = fileAncestors(root, currentPath);
    setExpanded((state) => new Set([...state, ...chain.map(filePathKey)]));
    void (async () => {
      for (const path of chain) {
        if (!alive || !(await load(path))) return;
      }
    })();
    return () => { alive = false; };
  }, [currentPath, selectedPath, treeRoots, load]);

  useEffect(() => {
    if (refreshKey > 0) for (const path of refreshPaths) void load(path, true);
  }, [refreshKey, refreshPaths, load]);

  const children = useMemo(() => new Map(Object.entries(directories).flatMap(([key, state]) => state.entries ? [[key, state.entries] as const] : [])), [directories]);
  const rows = useMemo(() => visibleFileRows(rootEntries, expanded, children), [rootEntries, expanded, children]);
  const selected = selectedPath ? filePathKey(selectedPath) : currentPath ? filePathKey(currentPath) : null;
  const tabStop = rows.some((row) => row.key === focused) ? focused : rows.find((row) => row.key === selected)?.key ?? rows[0]?.key;

  const focus = (key: string) => {
    setFocused(key);
    items.current.get(key)?.focus();
  };
  const expand = (row: FileTreeRow) => {
    setExpanded((state) => new Set(state).add(row.key));
    void load(row.entry.path);
  };
  const collapse = (key: string) => setExpanded((state) => { const next = new Set(state); next.delete(key); return next; });
  const activate = (row: FileTreeRow) => {
    setFocused(row.key);
    if (row.entry.isDirectory) { expand(row); onOpenDirectory(row.entry.path); }
    else onOpenFile(row.entry);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, row: FileTreeRow) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const action = fileTreeKeyAction(rows, row.key, event.key, expanded);
    if (action.focus || action.expand || action.collapse) {
      event.preventDefault();
      if (action.focus) focus(action.focus);
      if (action.expand) expand(row);
      if (action.collapse) collapse(action.collapse);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); activate(row);
    }
  };

  return (
    <aside className="flex max-h-64 min-h-40 min-w-0 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-card md:sticky md:top-0 md:max-h-[calc(100dvh-14rem)] md:min-h-[280px]" aria-label={tr("Explorar pastas")}>
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <span className="text-xs font-medium text-text">{tr("Explorar pastas")}</span>
        <Button size="icon-sm" variant="ghost" title={tr("Recolher tudo")} aria-label={tr("Recolher tudo")} onClick={() => { setExpanded(new Set()); setFocused(rootEntries[0] ? filePathKey(rootEntries[0].path) : null); }}>
          <ChevronsDownUp size={13} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-2" role="tree" aria-label={tr("Árvore de arquivos")}>
        {rows.map((row) => {
          const open = expanded.has(row.key);
          const directory = directories[row.key];
          const Icon = row.depth === 0 ? HardDrive : row.entry.isDirectory ? open ? FolderOpen : Folder : File;
          return (
            <div key={row.key} role="none" className="relative">
              {Array.from({ length: row.depth }, (_, depth) => <span key={depth} aria-hidden className="pointer-events-none absolute inset-y-0 border-l border-border-subtle" style={{ left: 16 + depth * 14 }} />)}
              <button
                ref={(element) => { if (element) items.current.set(row.key, element); else items.current.delete(row.key); }}
                type="button"
                role="treeitem"
                tabIndex={row.key === tabStop ? 0 : -1}
                aria-level={row.depth + 1}
                aria-setsize={row.siblings}
                aria-posinset={row.position}
                aria-expanded={row.entry.isDirectory ? open : undefined}
                aria-selected={row.key === selected}
                aria-busy={directory?.status === "loading" || undefined}
                onFocus={() => setFocused(row.key)}
                onClick={() => activate(row)}
                onKeyDown={(event) => onKeyDown(event, row)}
                title={row.entry.path}
                className={cn("relative flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[12px] transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50", row.key === selected ? "bg-accent/10 font-medium text-text" : "text-text-muted")}
                style={{ paddingLeft: 7 + row.depth * 14 }}
              >
                {row.entry.isDirectory ? (
                  <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center" onClick={(event) => { event.stopPropagation(); focus(row.key); if (open) collapse(row.key); else expand(row); }}>
                    {directory?.status === "loading" ? <Loader2 size={12} className="animate-spin" /> : open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </span>
                ) : <span className="w-4 shrink-0" />}
                <Icon size={14} className={cn("shrink-0", row.entry.isDirectory ? "text-accent/80" : "text-text-faint")} />
                <span className="min-w-0 truncate">{row.entry.name}</span>
              </button>
              {open && directory?.status === "error" && (
                <div className="space-y-1 py-1.5 pr-2 text-[11px] text-danger" style={{ paddingLeft: 30 + row.depth * 14 }}>
                  <p role="alert">{directory.message}</p>
                  <button className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-text-muted hover:bg-bg-hover" onClick={() => void load(row.entry.path, true)}><RotateCcw size={11} />{tr("Tentar novamente")}</button>
                </div>
              )}
              {open && directory?.status === "ready" && directory.entries.length === 0 && <p className="py-1 text-[11px] text-text-faint" style={{ paddingLeft: 30 + row.depth * 14 }}>{tr("Pasta vazia")}</p>}
            </div>
          );
        })}
      </div>
      <p className="border-t border-border-subtle px-3 py-2 text-[10px] text-text-faint">{tr("Use as setas para navegar.")}</p>
    </aside>
  );
}
