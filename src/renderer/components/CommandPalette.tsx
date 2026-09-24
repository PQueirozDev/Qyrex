import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  CalendarPlus,
  CheckSquare,
  Code2,
  File,
  Folder,
  FolderSearch,
  Megaphone,
  MessageCircle,
  Moon,
  Music2,
  Plus,
  Search,
  SquareTerminal,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { SearchResults } from "@shared/types";
import { cn } from "@/lib/cn";
import { fuzzyScore } from "@/lib/fuzzy";
import { attempt } from "@/lib/api";
import { useUIStore } from "@/stores/useUIStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { NAV_ITEMS } from "@/components/Sidebar";
import { Kbd } from "@/components/ui/primitives";

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
}

const GROUP_ORDER = ["Ações", "Projetos", "Clientes", "Tarefas", "Marketing", "Arquivos", "Navegação"];

/**
 * Command Palette global (Ctrl+K), inspirada no Raycast: fuzzy search sobre
 * ações, navegação, projetos e clientes, mais busca global (tarefas, marketing
 * e arquivos permitidos) a partir de 2 caracteres.
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const navigate = useUIStore((s) => s.navigate);
  const setQuickTaskOpen = useUIStore((s) => s.setQuickTaskOpen);
  const { projects, loaded: projectsLoaded, load: loadProjects, open: openProject } = useProjectsStore();
  const { clients, loaded: clientsLoaded, load: loadClients } = useClientsStore();
  const { settings, update: updateSettings } = useSettingsStore();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [results, setResults] = useState<SearchResults | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setResults(null);
    if (!projectsLoaded) void loadProjects();
    if (!clientsLoaded) void loadClients();
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, projectsLoaded, clientsLoaded, loadProjects, loadClients]);

  // Busca global com debounce (só dispara com 2+ caracteres).
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const data = await attempt(window.workspace.search.global(query.trim()));
      if (data) setResults(data);
    }, 180);
    return () => clearTimeout(t);
  }, [query, open]);

  const lastProject = useMemo(
    () => [...projects].filter((p) => p.lastOpenedAt).sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))[0] ?? projects[0],
    [projects]
  );

  const commands: Command[] = useMemo(() => {
    const close = () => setOpen(false);
    const act = (fn: () => void) => () => {
      close();
      fn();
    };

    const actions: Command[] = [
      { id: "new-task", group: "Ações", label: "Nova tarefa", hint: "Ctrl Shift T", icon: Plus, run: act(() => setQuickTaskOpen(true)) },
      { id: "new-project", group: "Ações", label: "Novo projeto", icon: Code2, run: act(() => navigate("projetos", "new")) },
      { id: "new-client", group: "Ações", label: "Novo cliente", icon: UserPlus, run: act(() => navigate("clientes", "new")) },
      { id: "new-event", group: "Ações", label: "Novo evento na agenda", icon: CalendarPlus, run: act(() => navigate("agenda", "new")) },
      { id: "new-content", group: "Ações", label: "Nova ideia de conteúdo", icon: Megaphone, run: act(() => navigate("marketing", "new")) },
      { id: "ask-claude", group: "Ações", label: "Perguntar ao Claude", keywords: "ia chat anthropic", icon: Bot, run: act(() => navigate("ia", "anthropic")) },
      { id: "ask-openai", group: "Ações", label: "Perguntar ao ChatGPT / OpenAI", keywords: "ia chat gpt codex", icon: Bot, run: act(() => navigate("ia", "openai")) },
      { id: "ask-gemini", group: "Ações", label: "Perguntar ao Gemini", keywords: "ia chat google", icon: Bot, run: act(() => navigate("ia", "google")) },
      { id: "ai-council", group: "Ações", label: "AI Council (vários modelos)", keywords: "ia comparar", icon: Bot, run: act(() => navigate("ia", "council")) },
      { id: "search-file", group: "Ações", label: "Pesquisar arquivo", icon: FolderSearch, run: act(() => navigate("arquivos", "search")) },
      { id: "search-client", group: "Ações", label: "Buscar cliente", icon: Users, run: act(() => navigate("clientes", "search")) },
      { id: "open-whatsapp", group: "Ações", label: "Abrir WhatsApp", icon: MessageCircle, run: act(() => navigate("whatsapp")) },
      { id: "open-spotify", group: "Ações", label: "Abrir Spotify", icon: Music2, run: act(() => void window.workspace.system.openSpotifyApp()) },
      {
        id: "toggle-theme",
        group: "Ações",
        label: `Alternar tema (atual: ${settings?.theme === "light" ? "claro" : settings?.theme === "system" ? "sistema" : "escuro"})`,
        icon: Moon,
        run: act(() => void updateSettings({ theme: settings?.theme === "dark" ? "light" : "dark" })),
      },
    ];

    if (lastProject) {
      actions.push(
        { id: "open-vscode", group: "Ações", label: "Abrir VS Code", hint: lastProject.name, icon: Code2, run: act(() => void openProject(lastProject, "vscode")) },
        { id: "open-terminal", group: "Ações", label: "Abrir terminal", hint: lastProject.name, icon: SquareTerminal, run: act(() => navigate("terminal", lastProject.id)) }
      );
    }

    const projectCommands: Command[] = projects.flatMap((p) => [
      { id: `p-${p.id}`, group: "Projetos", label: `Abrir projeto ${p.name}`, hint: "VS Code", keywords: p.technologies.join(" "), icon: Code2, run: act(() => void openProject(p, "vscode")) },
      { id: `pt-${p.id}`, group: "Projetos", label: `Terminal em ${p.name}`, icon: SquareTerminal, run: act(() => navigate("terminal", p.id)) },
      { id: `pd-${p.id}`, group: "Projetos", label: `Detalhes de ${p.name}`, hint: "Git, GitHub, tarefas", icon: Folder, run: act(() => navigate("projetos", p.id)) },
    ]);

    const clientCommands: Command[] = clients.map((c) => ({
      id: `c-${c.id}`,
      group: "Clientes",
      label: `Abrir cliente ${c.name}`,
      keywords: `${c.company ?? ""} ${c.instagram ?? ""}`,
      icon: Users,
      run: act(() => navigate("clientes", c.id)),
    }));

    const navCommands: Command[] = NAV_ITEMS.concat([
      { id: "integracoes", label: "Integrações", icon: Bot },
      { id: "configuracoes", label: "Configurações", icon: Bot },
    ]).map((n) => ({
      id: `nav-${n.id}`,
      group: "Navegação",
      label: `Ir para ${n.label}`,
      hint: "shortcut" in n ? n.shortcut : undefined,
      icon: n.icon,
      run: act(() => navigate(n.id)),
    }));

    return [...actions, ...projectCommands, ...clientCommands, ...navCommands];
  }, [projects, clients, lastProject, settings?.theme, navigate, openProject, setOpen, setQuickTaskOpen, updateSettings]);

  const visible = useMemo(() => {
    const q = query.trim();
    let list: Command[];
    if (!q) {
      list = commands.filter((c) => c.group === "Ações" || c.group === "Navegação");
    } else {
      list = commands
        .map((c) => ({ c, score: fuzzyScore(q, `${c.label} ${c.keywords ?? ""}`) }))
        .filter((r): r is { c: Command; score: number } => r.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
        .map((r) => r.c);
    }

    // Resultados da busca global que não estão cobertos pelos comandos.
    if (results) {
      const close = () => setOpen(false);
      list = list.concat(
        results.tasks.map((t) => ({
          id: `t-${t.id}`,
          group: "Tarefas",
          label: t.title,
          hint: t.status === "concluido" ? "Concluída" : t.dueDate ?? undefined,
          icon: CheckSquare,
          run: () => {
            close();
            navigate("tarefas", t.id);
          },
        })),
        results.marketing.map((m) => ({
          id: `m-${m.id}`,
          group: "Marketing",
          label: m.title,
          hint: m.type.toUpperCase(),
          icon: Megaphone,
          run: () => {
            close();
            navigate("marketing", m.id);
          },
        })),
        results.files.map((f) => ({
          id: `f-${f.path}`,
          group: "Arquivos",
          label: f.name,
          hint: f.path,
          icon: f.isDirectory ? Folder : File,
          run: () => {
            close();
            navigate("arquivos", f.path);
          },
        }))
      );
    }

    // Agrupa mantendo a ordem de relevância dentro de cada grupo.
    return list.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [commands, query, results, navigate, setOpen]);

  useEffect(() => setSelected(0), [query, results]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      visible[selected]?.run();
    }
  }

  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center bg-black/40 pt-[14vh] backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div
        className="w-full max-w-xl animate-pop-in overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
          <Search size={16} className="text-text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar projetos, clientes, tarefas, arquivos ou executar um comando..."
            className="w-full bg-transparent text-[14px] text-text placeholder:text-text-faint focus:outline-none"
          />
          <Kbd>ESC</Kbd>
        </div>

        <div ref={listRef} className="max-h-[420px] overflow-y-auto p-1.5">
          {visible.length === 0 && <div className="px-3 py-8 text-center text-sm text-text-faint">Nenhum resultado para “{query}”.</div>}
          {visible.map((cmd, index) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            const Icon = cmd.icon;
            return (
              <div key={cmd.id}>
                {header && <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-text-faint">{header}</div>}
                <button
                  data-index={index}
                  onClick={cmd.run}
                  onMouseMove={() => setSelected(index)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px]",
                    index === selected ? "bg-accent/10 text-text" : "text-text-muted"
                  )}
                >
                  <Icon size={15} className={index === selected ? "text-accent" : "text-text-faint"} />
                  <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <span className="max-w-[45%] truncate text-[11px] text-text-faint">{cmd.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-2 text-[11px] text-text-faint">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navegar
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd> executar
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
