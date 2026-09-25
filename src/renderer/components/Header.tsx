import { useEffect, useRef, useState } from "react";
import { CheckSquare, Code2, Command, File, Folder, Megaphone, Plus, Search, Users, WifiOff, X } from "lucide-react";
import type { SearchResults } from "@shared/types";
import { attempt } from "@/lib/api";
import { useUIStore, type Page } from "@/stores/useUIStore";
import { Button } from "@/components/ui/Button";
import { Kbd, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint">{title}</div>
      {children}
    </div>
  );
}

function ResultRow({ icon: Icon, label, hint, onClick }: { icon: typeof File; label: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-bg-hover">
      <Icon size={14} className="shrink-0 text-text-faint" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="max-w-[40%] truncate text-[11px] text-text-faint">{hint}</span>}
    </button>
  );
}

/** Barra superior: busca global com resultados por categoria, status offline e atalhos. */
export function Header() {
  const online = useUIStore((s) => s.online);
  const navigate = useUIStore((s) => s.navigate);
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const setQuickTaskOpen = useUIStore((s) => s.setQuickTaskOpen);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const data = await attempt(window.workspace.search.global(query.trim()));
      setResults(data ?? null);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setFocused(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const go = (page: Page, param?: string) => {
    setFocused(false);
    setQuery("");
    navigate(page, param);
  };

  const total = results
    ? results.projects.length + results.tasks.length + results.clients.length + results.files.length + results.marketing.length
    : 0;
  const showPanel = focused && query.trim().length >= 2;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle px-5">
      <div ref={boxRef} className="relative w-full max-w-md">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border bg-bg-elevated px-2.5 py-1.5 transition-colors",
            focused ? "border-accent/50 ring-2 ring-accent/15" : "border-border-subtle"
          )}
        >
          <Search size={14} className="text-text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), (e.target as HTMLInputElement).blur())}
            placeholder={tr("Buscar projetos, tarefas, clientes, arquivos...")}
            className="w-full bg-transparent text-[13px] text-text placeholder:text-text-faint focus:outline-none"
          />
          {loading ? <Spinner className="h-3.5 w-3.5" /> : query && (
            <button onClick={() => setQuery("")} className="text-text-faint hover:text-text" aria-label={tr("Limpar")}>
              <X size={13} />
            </button>
          )}
        </div>

        {showPanel && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-[60vh] animate-pop-in overflow-y-auto rounded-lg border border-border bg-bg-elevated py-1 shadow-pop">
            {results && total === 0 && !loading && <p className="px-3 py-4 text-center text-xs text-text-faint">{tr("Nada encontrado.")}</p>}
            {results && results.projects.length > 0 && (
              <ResultGroup title={tr("Projetos")}>
                {results.projects.map((p) => (
                  <ResultRow key={p.id} icon={Code2} label={p.name} hint={p.technologies.join(" · ")} onClick={() => go("projetos", p.id)} />
                ))}
              </ResultGroup>
            )}
            {results && results.tasks.length > 0 && (
              <ResultGroup title={tr("Tarefas")}>
                {results.tasks.map((t) => (
                  <ResultRow key={t.id} icon={CheckSquare} label={t.title} hint={t.status === "concluido" ? tr("Concluída") : t.dueDate ?? ""} onClick={() => go("tarefas", t.id)} />
                ))}
              </ResultGroup>
            )}
            {results && results.clients.length > 0 && (
              <ResultGroup title={tr("Clientes")}>
                {results.clients.map((c) => (
                  <ResultRow key={c.id} icon={Users} label={c.name} hint={c.company ?? ""} onClick={() => go("clientes", c.id)} />
                ))}
              </ResultGroup>
            )}
            {results && results.marketing.length > 0 && (
              <ResultGroup title={tr("Marketing")}>
                {results.marketing.map((m) => (
                  <ResultRow key={m.id} icon={Megaphone} label={m.title} hint={m.type.toUpperCase()} onClick={() => go("marketing", m.id)} />
                ))}
              </ResultGroup>
            )}
            {results && results.files.length > 0 && (
              <ResultGroup title={tr("Arquivos")}>
                {results.files.map((f) => (
                  <ResultRow key={f.path} icon={f.isDirectory ? Folder : File} label={f.name} hint={f.path} onClick={() => go("arquivos", f.path)} />
                ))}
              </ResultGroup>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {!online && (
          <span className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
            <WifiOff size={12} />{" "}{tr("Offline")}</span>
        )}
        <Button variant="ghost" size="sm" onClick={() => setQuickTaskOpen(true)} title={tr("Nova tarefa (Ctrl+Shift+T)")}>
          <Plus size={14} />{" "}{tr("Tarefa")}</Button>
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-text-faint hover:bg-bg-hover hover:text-text-muted"
        >
          <Command size={12} />{" "}{tr("Comandos")}{" "}<Kbd>{tr("Ctrl K")}</Kbd>
        </button>
      </div>
    </header>
  );
}
