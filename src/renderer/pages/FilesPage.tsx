import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  ChevronRight,
  ClipboardPaste,
  Code2,
  Copy,
  ExternalLink,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { DirEntry, FilePreview } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState, LoadingRows, Menu, PageHeader, Spinner, type MenuItem } from "@/components/ui/primitives";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { basename, dirname, formatBytes, timeAgo } from "@/lib/format";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { confirmAction, promptText, toast, useUIStore } from "@/stores/useUIStore";

const sep = (p: string) => (p.includes("\\") ? "\\" : "/");
const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase().replace(/\//g, "\\");

/** Diretório autorizado que contém `p` (o mais específico). */
function rootOf(p: string, roots: string[]): string | null {
  const target = norm(p);
  return (
    roots
      .filter((r) => target === norm(r) || target.startsWith(`${norm(r)}\\`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

function Breadcrumb({ root, path, onNavigate }: { root: string; path: string; onNavigate: (p: string) => void }) {
  const rest = path.slice(root.length).split(/[\\/]/).filter(Boolean);
  const s = sep(root);
  const crumbs = [{ label: basename(root) || root, path: root }];
  rest.forEach((part, i) => crumbs.push({ label: part, path: [root.replace(/[\\/]+$/, ""), ...rest.slice(0, i + 1)].join(s) }));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5 text-xs">
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRight size={12} className="text-text-faint" />}
          <button
            onClick={() => onNavigate(c.path)}
            className={cn("rounded px-1.5 py-0.5 hover:bg-bg-hover", i === crumbs.length - 1 ? "font-medium text-text" : "text-text-muted")}
          >
            {c.label}
          </button>
        </span>
      ))}
    </div>
  );
}

const TEXT_HIGHLIGHT_LIMIT = 120_000;

function PreviewPanel({ entry, onClose }: { entry: DirEntry; onClose: () => void }) {
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError(null);
    unwrap(window.workspace.files.preview(entry.path))
      .then((p) => !cancelled && setPreview(p))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [entry.path]);

  let body: ReactNode = <Spinner />;
  if (error) body = <ErrorState message={error} />;
  else if (preview?.kind === "image") body = <img src={preview.dataUrl} alt={entry.name} className="mx-auto max-h-[60vh] rounded-lg border border-border-subtle" />;
  else if (preview?.kind === "binary") body = <p className="text-sm text-text-muted">Arquivo binário ({formatBytes(preview.size)}) — sem pré-visualização.</p>;
  else if (preview?.kind === "too_large") body = <p className="text-sm text-text-muted">Arquivo grande demais para pré-visualizar ({formatBytes(preview.size)}).</p>;
  else if (preview?.kind === "text") {
    if (preview.language === "markdown") {
      body = (
        <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-bg-hover">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {preview.content}
          </ReactMarkdown>
        </div>
      );
    } else if (preview.content.length <= TEXT_HIGHLIGHT_LIMIT && preview.language !== "plaintext") {
      // O próprio pipeline de markdown faz o highlight do bloco de código.
      const fence = "`".repeat(Math.max(3, ...Array.from(preview.content.matchAll(/`{3,}/g), (m) => m[0].length + 1)));
      body = (
        <div className="text-[12px] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border-subtle [&_pre]:p-3">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{`${fence}${preview.language}\n${preview.content}\n${fence}`}</ReactMarkdown>
        </div>
      );
    } else {
      body = <pre className="overflow-x-auto whitespace-pre rounded-lg border border-border-subtle bg-bg p-3 font-mono text-[12px] text-text">{preview.content}</pre>;
    }
  }

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        <FileText size={14} className="shrink-0 text-text-faint" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{entry.name}</span>
        <Button size="xs" variant="secondary" onClick={() => void attempt(window.workspace.system.openFile(entry.path))}>
          <ExternalLink size={12} /> Abrir
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Fechar pré-visualização">
          <X size={13} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {body}
        {preview?.kind === "text" && preview.truncated && <p className="mt-2 text-[11px] text-text-faint">Arquivo truncado na pré-visualização.</p>}
      </div>
    </Card>
  );
}

interface Clipboard {
  path: string;
  mode: "copy" | "move";
}

export function FilesPage() {
  const settings = useSettingsStore((s) => s.settings);
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);
  const roots = useMemo(() => settings?.allowedProjectDirs ?? [], [settings?.allowedProjectDirs]);

  const [root, setRoot] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DirEntry | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!root && roots.length > 0) {
      setRoot(roots[0]);
      setCurrentPath(roots[0]);
    }
  }, [roots, root]);

  const refresh = useCallback(async () => {
    if (!currentPath) return;
    setLoading(true);
    try {
      const list = await unwrap(window.workspace.files.list(currentPath));
      setEntries([...list].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, "pt-BR")));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDir = useCallback(
    (p: string) => {
      const r = rootOf(p, roots);
      if (!r) {
        toast.error("Essa pasta não está dentro de um diretório autorizado.");
        return;
      }
      setRoot(r);
      setCurrentPath(p);
      setSelected(null);
    },
    [roots]
  );

  /** Mostra um arquivo: abre a pasta dele e seleciona para pré-visualização. */
  const revealFile = useCallback(
    (entry: DirEntry) => {
      openDir(dirname(entry.path));
      setSelected(entry);
    },
    [openDir]
  );

  // pageParam: "search" foca a busca; um caminho abre a pasta ou mostra o arquivo.
  useEffect(() => {
    if (!pageParam || roots.length === 0) return;
    if (pageParam === "search") {
      setTimeout(() => searchRef.current?.focus(), 30);
    } else {
      const target = pageParam;
      void window.workspace.files.list(target).then((res) => {
        if (res.ok) openDir(target);
        else revealFile({ name: basename(target), path: target, isDirectory: false, size: 0, modifiedAt: "" });
      });
    }
    navigate("arquivos");
  }, [pageParam, roots.length, openDir, revealFile, navigate]);

  // Busca por nome (com debounce) no diretório autorizado atual.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const data = await attempt(window.workspace.files.search(q, root ?? undefined));
      setResults(data ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, root]);

  async function newFolder() {
    if (!currentPath) return;
    const name = await promptText({ title: "Nova pasta", label: "Nome da pasta", placeholder: "nova-pasta", confirmLabel: "Criar" });
    if (!name) return;
    if (await attempt(window.workspace.files.createFolder(currentPath, name), "Pasta criada")) void refresh();
  }

  async function rename(entry: DirEntry) {
    const name = await promptText({ title: "Renomear", label: "Novo nome", initialValue: entry.name, confirmLabel: "Renomear" });
    if (!name || name === entry.name) return;
    const newPath = await attempt(window.workspace.files.rename(entry.path, name), "Renomeado");
    if (newPath !== undefined) {
      if (selected?.path === entry.path) setSelected(null);
      void refresh();
    }
  }

  async function remove(entry: DirEntry) {
    const ok = await confirmAction({
      title: `Excluir ${entry.isDirectory ? "a pasta" : "o arquivo"} "${entry.name}"?`,
      description: entry.isDirectory ? "A pasta e todo o conteúdo dela serão excluídos." : "O arquivo será excluído.",
      detail: entry.path,
      danger: true,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const res = await attempt(window.workspace.files.delete(entry.path, true), "Excluído");
    if (res !== undefined) {
      if (selected?.path === entry.path) setSelected(null);
      if (clipboard?.path === entry.path) setClipboard(null);
      void refresh();
    }
  }

  async function paste() {
    if (!clipboard || !currentPath) return;
    if (clipboard.mode === "copy") {
      if ((await attempt(window.workspace.files.copy(clipboard.path, currentPath), "Copiado")) !== undefined) void refresh();
      return;
    }
    const ok = await confirmAction({
      title: `Mover "${basename(clipboard.path)}"?`,
      description: `O item sai da pasta original e vai para ${basename(currentPath)}.`,
      detail: `${clipboard.path}\n→ ${currentPath}`,
      danger: true,
      confirmLabel: "Mover",
    });
    if (!ok) return;
    if ((await attempt(window.workspace.files.move(clipboard.path, currentPath, true), "Movido")) !== undefined) {
      setClipboard(null);
      void refresh();
    }
  }

  function copyPath(p: string) {
    void navigator.clipboard.writeText(p).then(() => toast.success("Caminho copiado"));
  }

  function menuFor(entry: DirEntry): (MenuItem | "separator")[] {
    return [
      entry.isDirectory
        ? { label: "Abrir pasta", icon: FolderOpen, onSelect: () => openDir(entry.path) }
        : { label: "Abrir", icon: ExternalLink, onSelect: () => void attempt(window.workspace.system.openFile(entry.path)) },
      { label: "Abrir no Explorer", icon: Folder, onSelect: () => void attempt(window.workspace.system.openExplorer(entry.path)) },
      { label: "Abrir no VS Code", icon: Code2, onSelect: () => void attempt(window.workspace.system.openVSCode(entry.path)) },
      { label: "Copiar caminho", icon: Link2, onSelect: () => copyPath(entry.path) },
      "separator",
      { label: "Renomear", icon: Pencil, onSelect: () => void rename(entry) },
      { label: "Copiar", icon: Copy, onSelect: () => setClipboard({ path: entry.path, mode: "copy" }) },
      { label: "Recortar (mover)", icon: Scissors, onSelect: () => setClipboard({ path: entry.path, mode: "move" }) },
      "separator",
      { label: "Excluir", icon: Trash2, danger: true, onSelect: () => void remove(entry) },
    ];
  }

  function row(entry: DirEntry, showDir = false) {
    return (
      <div
        key={entry.path}
        className={cn(
          "group flex cursor-default items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-bg-hover/50",
          selected?.path === entry.path && "bg-accent/5"
        )}
        onClick={() => (entry.isDirectory ? openDir(entry.path) : showDir ? revealFile(entry) : setSelected(entry))}
        onDoubleClick={() => !entry.isDirectory && void attempt(window.workspace.system.openFile(entry.path))}
      >
        {entry.isDirectory ? <Folder size={15} className="shrink-0 text-accent" /> : <File size={15} className="shrink-0 text-text-faint" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text">{entry.name}</p>
          {showDir && <p className="truncate text-[11px] text-text-faint">{dirname(entry.path)}</p>}
        </div>
        {!entry.isDirectory && <span className="w-16 text-right text-[11px] text-text-faint">{formatBytes(entry.size)}</span>}
        <span className="w-20 text-right text-[11px] text-text-faint">{entry.modifiedAt ? timeAgo(entry.modifiedAt) : ""}</span>
        <div className="opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <Menu trigger={<MoreHorizontal size={15} />} items={menuFor(entry)} />
        </div>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div>
        <PageHeader title="Arquivos" />
        <Card>
          <EmptyState
            icon={FolderOpen}
            title="Nenhuma pasta autorizada"
            description="O Workspace só acessa pastas que você autorizar. Adicione a pasta dos seus projetos para começar."
            action={
              <Button size="sm" onClick={() => void useSettingsStore.getState().addAllowedDir()}>
                <FolderPlus size={14} /> Autorizar pasta
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Arquivos"
        description="Somente dentro das pastas autorizadas em Configurações."
        actions={
          <>
            <select
              className="input w-52 py-1 text-xs"
              value={root ?? ""}
              onChange={(e) => {
                setRoot(e.target.value);
                setCurrentPath(e.target.value);
                setSelected(null);
              }}
            >
              {roots.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                ref={searchRef}
                className="input w-56 py-1 pl-7 text-xs"
                placeholder="Buscar por nome..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              />
            </div>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {root && currentPath && <Breadcrumb root={root} path={currentPath} onNavigate={openDir} />}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => void newFolder()}>
            <FolderPlus size={13} /> Nova pasta
          </Button>
          <Button size="sm" variant="ghost" onClick={() => currentPath && void attempt(window.workspace.system.openExplorer(currentPath))} title="Abrir no Explorer">
            <Folder size={13} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => currentPath && void attempt(window.workspace.system.openVSCode(currentPath))} title="Abrir no VS Code">
            <Code2 size={13} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void refresh()} title="Atualizar">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {clipboard && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
          {clipboard.mode === "copy" ? <Copy size={13} className="text-accent" /> : <Scissors size={13} className="text-accent" />}
          <span className="min-w-0 flex-1 truncate text-text-muted">
            {clipboard.mode === "copy" ? "Copiar" : "Mover"} <span className="font-medium text-text">{basename(clipboard.path)}</span> — navegue até
            a pasta de destino e cole aqui.
          </span>
          <Button size="xs" onClick={() => void paste()}>
            <ClipboardPaste size={12} /> Colar aqui
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setClipboard(null)}>
            Cancelar
          </Button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      <div className={cn("grid gap-4", selected && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        <Card className="overflow-hidden">
          {results !== null || searching ? (
            <>
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2 text-xs text-text-muted">
                <span>
                  Resultados para “{query.trim()}” {results && `· ${results.length}`}
                </span>
                <Button size="xs" variant="ghost" onClick={() => setQuery("")}>
                  Limpar busca
                </Button>
              </div>
              {searching && results === null ? (
                <div className="p-4">
                  <LoadingRows />
                </div>
              ) : results && results.length === 0 ? (
                <EmptyState icon={Search} title="Nada encontrado" description="A busca procura pelo nome em até 6 níveis de pastas." />
              ) : (
                <div className="divide-y divide-border-subtle">{results?.map((e) => row(e, true))}</div>
              )}
            </>
          ) : loading && entries.length === 0 ? (
            <div className="p-4">
              <LoadingRows />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState icon={FolderOpen} title="Pasta vazia" />
          ) : (
            <div className="divide-y divide-border-subtle">{entries.map((e) => row(e))}</div>
          )}
        </Card>

        {selected && !selected.isDirectory && (
          <div className="lg:sticky lg:top-0 lg:max-h-[calc(100vh-9rem)]">
            <PreviewPanel entry={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
