import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderTree,
  GitBranch,
  Gauge,
  MonitorPlay,
  NotebookPen,
  Plus,
  RefreshCw,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import type { DirEntry, ProjectWithGit } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { EmptyState, LoadingRows, Spinner } from "@/components/ui/primitives";
import { GitPanel } from "@/components/GitPanel";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { MonitorView } from "@/components/runner/MonitorView";
import { ProjectScriptsSection } from "@/components/runner/ProjectScripts";
import { RunnerOutput } from "@/components/runner/RunnerOutput";
import { TerminalView, type Status } from "@/pages/TerminalPage";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeDay, timeAgo } from "@/lib/format";
import { tr } from "@/lib/i18n";
import type { PanelId } from "@/lib/workspaceLayout";
import { useAIStore } from "@/stores/useAIStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useRunnerStore } from "@/stores/useRunnerStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTasksStore } from "@/stores/useTasksStore";
import { usePluginsStore } from "@/stores/usePluginsStore";
import { toast, useUIStore } from "@/stores/useUIStore";

const Markdown = lazy(() => import("react-markdown"));

export const PANEL_META: Record<PanelId, { label: string; icon: LucideIcon }> = {
  files: { label: tr("Arquivos"), icon: FolderTree },
  terminal: { label: tr("Terminal"), icon: SquareTerminal },
  git: { label: tr("Git"), icon: GitBranch },
  preview: { label: tr("Preview"), icon: MonitorPlay },
  ai: { label: tr("IA"), icon: Bot },
  tasks: { label: tr("Tarefas"), icon: CheckSquare },
  notes: { label: tr("Notas"), icon: NotebookPen },
  processes: { label: tr("Processos"), icon: Activity },
  monitor: { label: tr("Monitor"), icon: Gauge },
};

// --- Arquivos ----------------------------------------------------------------------

/** Pastas que começam fechadas e não são listadas sem pedir (pesadas e raramente úteis). */
const HEAVY = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "target", "out"]);

function TreeNode({ entry, depth }: { entry: DirEntry; depth: number }) {
  const navigate = useUIStore((s) => s.navigate);
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);

  const toggle = async () => {
    if (!entry.isDirectory) {
      navigate("editor", entry.path);
      return;
    }
    if (!open && children === null) setChildren((await attempt(window.workspace.files.list(entry.path))) ?? []);
    setOpen(!open);
  };

  return (
    <li>
      <button
        onClick={() => void toggle()}
        className={cn("flex w-full items-center gap-1 rounded px-1 py-[3px] text-left text-[12.5px] hover:bg-bg-hover", HEAVY.has(entry.name) ? "text-text-faint" : "text-text-muted hover:text-text")}
        style={{ paddingLeft: 4 + depth * 12 }}
        title={entry.isDirectory ? entry.path : tr("Abrir no editor")}
      >
        {entry.isDirectory ? (open ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />) : <span className="w-3 shrink-0" />}
        {entry.isDirectory ? <Folder size={13} className="shrink-0 text-accent/80" /> : <File size={13} className="shrink-0 text-text-faint" />}
        <span className="truncate">{entry.name}</span>
      </button>
      {open && children && (
        <ul>
          {children.map((c) => (
            <TreeNode key={c.path} entry={c} depth={depth + 1} />
          ))}
          {children.length === 0 && <li className="py-0.5 text-[11px] text-text-faint" style={{ paddingLeft: 20 + depth * 12 }}>{tr("Pasta vazia")}</li>}
        </ul>
      )}
    </li>
  );
}

function FilesPanel({ project }: { project: ProjectWithGit }) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setEntries(null);
    void attempt(window.workspace.files.list(project.localPath)).then((e) => setEntries(e ?? []));
  }, [project.localPath, version]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-2 py-1 text-[11px] text-text-faint">
        <span className="truncate font-mono" title={project.localPath}>{project.name}</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setVersion((v) => v + 1)} aria-label={tr("Atualizar")} title={tr("Atualizar")}>
          <RefreshCw size={11} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {entries === null ? (
          <LoadingRows rows={4} />
        ) : (
          <ul key={version}>
            {entries.map((e) => (
              <TreeNode key={e.path} entry={e} depth={0} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Terminal ----------------------------------------------------------------------

function TerminalPanel({ project, visible }: { project: ProjectWithGit; visible: boolean }) {
  const [status, setStatus] = useState<Status | undefined>();
  // Trocar a chave reinicia a sessão (ex.: depois de digitar "exit").
  const [generation, setGeneration] = useState(0);
  return (
    <div className="relative h-full">
      <TerminalView
        key={generation}
        tab={{ key: `ws-${project.id}-${generation}`, cwd: project.localPath, shell: "powershell", title: project.name }}
        layout="tabs"
        shown={visible}
        focused={visible}
        status={status}
        onFocus={() => undefined}
        onStatus={setStatus}
        onExit={() => setGeneration((g) => g + 1)}
      />
    </div>
  );
}

// --- Tarefas -----------------------------------------------------------------------

function TasksPanel({ project }: { project: ProjectWithGit }) {
  const { tasks, loaded, load, toggleDone, create } = useTasksStore();
  const navigate = useUIStore((s) => s.navigate);
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const open = tasks.filter((t) => t.projectId === project.id && t.status !== "concluido");
  return (
    <div className="flex h-full flex-col">
      <form
        className="flex gap-1.5 border-b border-border-subtle p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          void create({ title: title.trim(), projectId: project.id }).then((ok) => ok && setTitle(""));
        }}
      >
        <input className="input py-1 text-xs" placeholder={tr("Nova tarefa neste projeto")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" size="icon" variant="secondary" aria-label={tr("Adicionar")} disabled={!title.trim()}>
          <Plus size={13} />
        </Button>
      </form>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {!loaded ? (
          <LoadingRows rows={3} />
        ) : open.length === 0 ? (
          <EmptyState mascot title={tr("Nada pendente neste projeto")} className="py-4" />
        ) : (
          <ul className="space-y-0.5">
            {open.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-bg-hover">
                <input type="checkbox" checked={false} onChange={() => void toggleDone(t)} aria-label={tr("Concluir {name}", { name: t.title })} />
                <button className="min-w-0 flex-1 truncate text-left text-text" onClick={() => navigate("tarefas", t.id)}>
                  {t.title}
                </button>
                {t.dueDate && <span className="shrink-0 text-[11px] text-text-faint first-letter:uppercase">{relativeDay(t.dueDate)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Notas -------------------------------------------------------------------------

function NotesPanel({ project }: { project: ProjectWithGit }) {
  const notesOn = usePluginsStore((s) => s.isActive("notes"));
  const navigate = useUIStore((s) => s.navigate);
  if (!notesOn) {
    return (
      <EmptyState
        icon={NotebookPen}
        title={tr("Notas desligadas")}
        description={tr("Ligue o plugin Notas do projeto para usar este painel. As notas salvas continuam guardadas.")}
        action={
          <Button size="sm" variant="secondary" onClick={() => navigate("plugins")}>
            {tr("Abrir Plugins")}
          </Button>
        }
      />
    );
  }
  return <NotesEditor project={project} />;
}

function NotesEditor({ project }: { project: ProjectWithGit }) {
  const [text, setText] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    void attempt(window.workspace.notes.get(project.id)).then((n) => {
      setText(n?.content ?? "");
      setSavedAt(n?.updatedAt ?? null);
    });
  }, [project.id]);

  const save = useCallback(
    async (content: string) => {
      const n = await attempt(window.workspace.notes.save(project.id, content));
      if (n) {
        dirty.current = false;
        setSavedAt(n.updatedAt);
      }
    },
    [project.id]
  );

  // Salva sozinho 700 ms depois de parar de digitar (e ao sair do painel).
  const onChange = (value: string) => {
    setText(value);
    dirty.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(value), 700);
  };
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  if (text === null) return <LoadingRows rows={3} />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-2 py-1 text-[11px] text-text-faint">
        <span>{dirty.current ? tr("Salvando...") : savedAt ? tr("Salvo {time}", { time: timeAgo(savedAt) }) : tr("Markdown, salvo sozinho")}</span>
        <Button size="xs" variant="ghost" onClick={() => setPreview(!preview)}>
          {preview ? tr("Editar") : tr("Visualizar")}
        </Button>
      </div>
      {preview ? (
        <div className="prose prose-sm min-h-0 max-w-none flex-1 overflow-auto p-3 text-text dark:prose-invert">
          <Suspense fallback={<Spinner />}>
            <Markdown>{text || tr("_Nota vazia._")}</Markdown>
          </Suspense>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={tr("Decisões, comandos úteis, links, o que falta fazer...")}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[12.5px] leading-relaxed text-text placeholder:text-text-faint focus:outline-none"
        />
      )}
    </div>
  );
}

// --- IA ----------------------------------------------------------------------------

function AiPanel({ project }: { project: ProjectWithGit }) {
  const [question, setQuestion] = useState("");
  const { providers, loadProviders, createConversation, setPendingDraft } = useAIStore();
  const settings = useSettingsStore((s) => s.settings);
  const navigate = useUIStore((s) => s.navigate);

  async function ask() {
    if (!providers.length) await loadProviders();
    const all = useAIStore.getState().providers.filter((p) => p.connected);
    const provider = all.find((p) => p.id === settings?.aiDefaultProvider) ?? all[0];
    if (!provider) {
      toast.error(tr("Conecte uma IA em Integrações para usar este recurso."));
      return;
    }
    // A conversa fica ligada ao projeto (a IA recebe o nome e as tecnologias, nada mais sem você anexar).
    const id = await createConversation({ provider: provider.id, model: provider.defaultModel, projectId: project.id });
    if (!id) return;
    setPendingDraft({ conversationId: id, text: question.trim() });
    navigate("ia");
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <p className="text-xs text-text-muted">{tr("Pergunte sobre {name}. A conversa abre na Central de IA, ligada a este projeto; arquivos só vão se você anexar.", { name: project.name })}</p>
      <textarea
        className="input min-h-[80px] flex-1 resize-none"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={tr("Ex.: como organizo os testes deste projeto?")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && question.trim()) void ask();
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void ask()} disabled={!question.trim()}>
          <Bot size={13} /> {tr("Perguntar")}
        </Button>
      </div>
    </div>
  );
}

// --- Processos ---------------------------------------------------------------------

function ProcessesPanel({ project }: { project: ProjectWithGit }) {
  const processes = useRunnerStore((s) => s.processes);
  const mine = processes.filter((p) => p.projectId === project.id);
  const [selected, setSelected] = useState<string | null>(null);
  const current = mine.find((p) => p.id === selected) ?? mine.find((p) => p.status === "running") ?? mine[0] ?? null;
  return (
    <div className="flex h-full flex-col">
      <div className="max-h-[45%] overflow-auto border-b border-border-subtle p-2">
        <ProjectScriptsSection projectId={project.id} />
        {mine.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {mine.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={cn("flex items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[11px]", current?.id === p.id ? "bg-bg-hover text-text" : "text-text-faint hover:text-text")}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", p.status === "running" ? "bg-success" : p.status === "failed" ? "bg-danger" : "bg-text-faint")} />
                {p.script ?? p.command}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {current ? (
          <RunnerOutput key={current.id + current.startedAt} processId={current.id} />
        ) : (
          <p className="p-3 text-xs text-text-faint">{tr("Rode um script para ver os logs aqui.")}</p>
        )}
      </div>
    </div>
  );
}

/** Conteúdo de um painel. `visible`: o painel está na tela (aba ativa do grupo e página aberta). */
export function PanelContent({ panel, project, visible }: { panel: PanelId; project: ProjectWithGit; visible: boolean }) {
  const reloadProjects = useProjectsStore((s) => s.load);
  switch (panel) {
    case "files":
      return <FilesPanel project={project} />;
    case "terminal":
      return <TerminalPanel project={project} visible={visible} />;
    case "git":
      return (
        <div className="h-full overflow-auto p-3">
          <GitPanel project={project} onChanged={() => void reloadProjects()} />
        </div>
      );
    case "preview":
      return <PreviewPanel visible={visible} projectId={project.id} compact />;
    case "ai":
      return <AiPanel project={project} />;
    case "tasks":
      return <TasksPanel project={project} />;
    case "notes":
      return <NotesPanel project={project} />;
    case "processes":
      return <ProcessesPanel project={project} />;
    case "monitor":
      return <MonitorView visible={visible} />;
  }
}
