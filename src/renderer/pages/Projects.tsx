import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Code2,
  FileCode2,
  ExternalLink,
  FolderOpen,
  FolderSearch,
  GitBranch,
  GitPullRequest,
  Github,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  SquareTerminal,
  Star,
  Trash2,
  CircleDot,
  CaseSensitive,
  Archive,
  ArchiveRestore,
  Workflow,
  Timer,
  ImagePlus,
  ScanSearch,
  LayoutGrid,
  LayoutDashboard,
  List,
  Loader2,
  CircleCheck,
  CircleX,
  CircleSlash,
} from "lucide-react";
import type { GitHubOverview, GitHubWorkflowRun, ProjectIconMode, ProjectStatus, ProjectWithGit } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, Drawer, EmptyState, ErrorState, Field, LoadingRows, Menu, PageHeader, ProjectIcon, Segmented, Spinner } from "@/components/ui/primitives";
import { TaskFormDialog } from "@/components/TaskFormDialog";
import { GitPanel } from "@/components/GitPanel";
import { CommitSparkline, LanguageBar, useProjectInsights } from "@/components/ProjectInsights";
import { ProjectScriptsSection } from "@/components/runner/ProjectScripts";
import { EnvSection } from "@/components/EnvSection";
import { useFocusSummary } from "@/components/Focus";
import { formatUsage } from "@/components/AppUsage";
import { useFocusStore } from "@/stores/useFocusStore";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeDay, timeAgo } from "@/lib/format";
import { fuzzyFilter } from "@/lib/fuzzy";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useTasksStore } from "@/stores/useTasksStore";
import { confirmAction, toast, useUIStore } from "@/stores/useUIStore";

import { tr, trn } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { tm } from "@shared/i18n";

const STATUS_LABEL: Record<ProjectStatus, string> = { ativo: tm("Ativo"), pausado: tm("Pausado"), concluido: tm("Concluído") };
const STATUS_TONE: Record<ProjectStatus, "success" | "warning" | "neutral"> = { ativo: "success", pausado: "warning", concluido: "neutral" };

function StatusBadge({ project }: { project: ProjectWithGit }) {
  if (project.archivedAt) return <Badge>{tr("Arquivado")}</Badge>;
  // "Ativo" é o normal: só mostra quando foge disso.
  if (project.status === "ativo") return null;
  return <Badge tone={STATUS_TONE[project.status]}>{tr(STATUS_LABEL[project.status])}</Badge>;
}

/** Arquivar pede confirmação explicando que nada é apagado. */
async function toggleArchive(project: ProjectWithGit): Promise<void> {
  if (!project.archivedAt) {
    const ok = await confirmAction({
      title: tr("Arquivar \"{name}\"?", { name: project.name }),
      description: tr("O projeto sai do Início, da paleta de comandos e da bandeja, e o Git dele deixa de ser consultado. Cadastro, tarefas e a pasta continuam como estão; dá para desarquivar quando quiser."),
      confirmLabel: tr("Arquivar"),
    });
    if (!ok) return;
  }
  await useProjectsStore.getState().setArchived(project.id, !project.archivedAt);
}
/** Pede confirmação e exclui o cadastro do projeto (a pasta fica intacta). Devolve true se excluiu. */
async function confirmDeleteProject(project: ProjectWithGit): Promise<boolean> {
  const ok = await confirmAction({
    title: tr("Excluir o projeto \"{name}\"?", { name: project.name }),
    description: tr("Só o cadastro é apagado do Qyrex. Nenhum arquivo da pasta é excluído."),
    detail: project.localPath,
    danger: true,
    confirmLabel: tr("Excluir"),
  });
  if (!ok) return false;
  return useProjectsStore.getState().remove(project.id);
}

// --- Diálogo de criação/edição ------------------------------------------------------

function ProjectFormDialog({
  open,
  project,
  onClose,
  onDelete,
}: {
  open: boolean;
  project: ProjectWithGit | null;
  onClose: () => void;
  onDelete: (project: ProjectWithGit) => void;
}) {
  const { create, update } = useProjectsStore();

  const [localPath, setLocalPath] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [technologies, setTechnologies] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("ativo");
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  const [iconMode, setIconMode] = useState<ProjectIconMode>("auto");
  const [iconBusy, setIconBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIcon(project?.icon ?? null);
    setIconMode(project?.iconMode ?? "auto");
    setLocalPath(project?.localPath ?? "");
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setTechnologies(project?.technologies.join(", ") ?? "");
    setGithubUrl(project?.githubUrl ?? "");
    setStatus(project?.status ?? "ativo");
  }, [open, project]);

  async function pickFolder() {
    const dir = await attempt(window.workspace.system.pickDirectory(tr("Pasta do projeto")));
    if (!dir) return;
    setLocalPath(dir);
    setDetecting(true);
    // Pré-preenche com o que dá para descobrir pelo package.json e pelo git.
    const detected = await attempt(window.workspace.projects.detect(dir));
    setDetecting(false);
    if (!detected) return;
    if (detected.name) setName((v) => v || detected.name || "");
    if (detected.technologies.length > 0) setTechnologies(detected.technologies.join(", "));
    if (detected.githubUrl) setGithubUrl(detected.githubUrl);
    setIcon(detected.icon);
  }

  // O ícone é aplicado na hora (como a foto de perfil), sem esperar o "Salvar".
  async function pickIcon() {
    if (!project) return;
    setIconBusy(true);
    const result = await attempt(window.workspace.projects.pickIcon(project.id));
    setIconBusy(false);
    if (!result) return;
    setIcon(result.icon);
    setIconMode("custom");
    void useProjectsStore.getState().load();
  }

  async function changeIconMode(mode: "auto" | "none") {
    if (!project) return;
    setIconBusy(true);
    const result = await attempt(window.workspace.projects.setIconMode(project.id, mode));
    setIconBusy(false);
    if (result === undefined) return;
    setIcon(result);
    setIconMode(mode);
    void useProjectsStore.getState().load();
  }

  const iconHint =
    iconMode === "custom"
      ? tr("Imagem escolhida por você.")
      : iconMode === "none"
        ? tr("Mostrando as iniciais do nome.")
        : icon
          ? project
            ? tr("Detectado automaticamente na pasta do projeto.")
            : tr("Detectado na pasta. Dá para trocar depois em Editar.")
          : tr("Nenhum ícone ou logo encontrado na pasta.");

  async function save() {
    if (!name.trim() || !localPath) return;
    setSaving(true);
    const techList = technologies
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const ok = project
      ? await update(project.id, {
          name: name.trim(),
          description: description.trim() || null,
          technologies: techList,
          githubUrl: githubUrl.trim() || null,
          status,
        })
      : await create({
          name: name.trim(),
          description: description.trim() || undefined,
          localPath,
          technologies: techList,
          githubUrl: githubUrl.trim() || undefined,
        });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissable={false}
      title={project ? tr("Editar projeto") : tr("Novo projeto")}
      description={project ? undefined : tr("Escolha a pasta: nome, tecnologias e GitHub são detectados automaticamente.")}
      footer={
        <>
          {project && (
            <Button size="sm" variant="danger" className="mr-auto" onClick={() => onDelete(project)}>
              <Trash2 size={13} />{" "}{tr("Excluir")}</Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>{tr("Cancelar")}</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!name.trim() || !localPath}>
            {project ? tr("Salvar") : tr("Adicionar projeto")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={tr("Pasta")} hint={project ? tr("A pasta de um projeto existente não pode ser trocada.") : tr("Precisa estar dentro de um diretório autorizado.")}>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" value={localPath} readOnly placeholder={tr("Nenhuma pasta escolhida")} />
            {!project && (
              <Button variant="secondary" size="md" onClick={pickFolder} loading={detecting}>
                <FolderSearch size={14} />{" "}{tr("Escolher")}</Button>
            )}
          </div>
        </Field>
        {(project || localPath) && (
          <Field label={tr("Ícone")} hint={iconHint}>
            <div className="flex items-center gap-3">
              <ProjectIcon name={name || "?"} icon={icon} size={40} />
              {project && (
                <div className="flex flex-wrap gap-1.5">
                  <Button size="xs" variant="secondary" onClick={() => void pickIcon()} disabled={iconBusy}>
                    <ImagePlus size={12} />{" "}{tr("Escolher imagem")}</Button>
                  {iconMode !== "auto" && (
                    <Button size="xs" variant="ghost" onClick={() => void changeIconMode("auto")} disabled={iconBusy}>
                      <ScanSearch size={12} />{" "}{tr("Detectar automaticamente")}</Button>
                  )}
                  {iconMode !== "none" && (
                    <Button size="xs" variant="ghost" onClick={() => void changeIconMode("none")} disabled={iconBusy}>
                      <CaseSensitive size={12} />{" "}{tr("Usar iniciais")}</Button>
                  )}
                </div>
              )}
            </div>
          </Field>
        )}
        <Field label={tr("Nome")}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-projeto" />
        </Field>
        <Field label={tr("Descrição")}>
          <textarea className="input min-h-[60px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("Tecnologias")} hint={tr("Separe por vírgula")}>
            <input className="input" value={technologies} onChange={(e) => setTechnologies(e.target.value)} placeholder={tr("React, TypeScript")} />
          </Field>
        </div>
        {project && (
          <Field label={tr("Status")}>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {tr(STATUS_LABEL[s])}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={tr("Repositório no GitHub")}>
          <input className="input" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/usuario/repo" />
        </Field>
      </div>
    </Dialog>
  );
}

// --- Drawer de detalhes -------------------------------------------------------------

/** Ícone e cor de uma execução do Actions. */
function RunStatus({ run }: { run: GitHubWorkflowRun }) {
  if (run.status !== "completed") return <Loader2 size={12} className="shrink-0 animate-spin text-warning" aria-label={tr("Rodando")} />;
  if (run.conclusion === "success") return <CircleCheck size={12} className="shrink-0 text-success" aria-label={tr("Passou")} />;
  if (run.conclusion === "failure" || run.conclusion === "timed_out") return <CircleX size={12} className="shrink-0 text-danger" aria-label={tr("Falhou")} />;
  return <CircleSlash size={12} className="shrink-0 text-text-faint" aria-label={run.conclusion ?? ""} />;
}

function GitHubSection({ url }: { url: string }) {
  const [data, setData] = useState<GitHubOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useUIStore((s) => s.navigate);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await unwrap(window.workspace.github.overview(url)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (href: string) => void attempt(window.workspace.system.openExternalUrl(href));

  if (loading) return <LoadingRows rows={2} />;
  if (error)
    return (
      <div className="space-y-2">
        <ErrorState message={error} onRetry={() => void load()} />
        <Button size="xs" variant="ghost" onClick={() => navigate("integracoes")}>{tr("Configurar GitHub em Integrações")}</Button>
      </div>
    );
  if (!data) return null;

  const list = (items: GitHubOverview["issues"], icon: typeof CircleDot, empty: string) => {
    const Icon = icon;
    return items.length === 0 ? (
      <p className="text-xs text-text-faint">{empty}</p>
    ) : (
      <div className="space-y-1">
        {items.slice(0, 6).map((i) => (
          <button key={i.number} onClick={() => open(i.htmlUrl)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-bg-hover">
            <Icon size={12} className="shrink-0 text-success" />
            <span className="min-w-0 flex-1 truncate text-text">{i.title}</span>
            <span className="shrink-0 text-text-faint">#{i.number}</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="font-medium text-text">{data.repo.fullName}</span>
        {data.repo.private && <Badge>{tr("Privado")}</Badge>}
        <span>★ {data.repo.stars}</span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => open(data.repo.htmlUrl)} title={tr("Abrir no GitHub")}>
          <ExternalLink size={12} />
        </Button>
      </div>
      {data.runs.length > 0 && (
        <div>
          <p className="section-title mb-1">{tr("CI (GitHub Actions)")}</p>
          <div className="space-y-1">
            {data.runs.slice(0, 5).map((r) => (
              <button key={r.id} onClick={() => open(r.htmlUrl)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-bg-hover">
                <RunStatus run={r} />
                <span className="shrink-0 font-medium text-text-muted">{r.name}</span>
                <span className="min-w-0 flex-1 truncate text-text">{r.title}</span>
                {r.branch && <span className="max-w-[90px] shrink-0 truncate font-mono text-[10.5px] text-text-faint">{r.branch}</span>}
                <span className="shrink-0 text-text-faint">{timeAgo(r.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="section-title mb-1">{tr("Pull requests abertos")}</p>
        {list(data.pulls, GitPullRequest, "Nenhum PR aberto.")}
      </div>
      <div>
        <p className="section-title mb-1">{tr("Issues abertas")}</p>
        {list(data.issues, CircleDot, "Nenhuma issue aberta.")}
      </div>
    </div>
  );
}

function ProjectDrawer({
  project,
  onClose,
  onEdit,
  onDelete,
}: {
  project: ProjectWithGit;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { open, load, toggleFavorite } = useProjectsStore();
  const { tasks, loaded: tasksLoaded, load: loadTasks, toggleDone } = useTasksStore();
  const navigate = useUIStore((s) => s.navigate);
  const [taskOpen, setTaskOpen] = useState(false);
  const setFocusDialog = useFocusStore((s) => s.setDialog);

  useEffect(() => {
    if (!tasksLoaded) void loadTasks();
  }, [tasksLoaded, loadTasks]);

  const projectTasks = tasks.filter((t) => t.projectId === project.id && t.status !== "concluido");
  const focusSummary = useFocusSummary(7, project.id);
  const focusSeconds = focusSummary?.byProject.find((p) => p.projectId === project.id)?.seconds ?? 0;

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title={
        <span className="flex items-center gap-2">
          <ProjectIcon name={project.name} icon={project.icon} size={24} className="rounded-md" />
          {project.name}
          {project.favorite && <Star size={13} className="fill-warning text-warning" />}
          <StatusBadge project={project} />
        </span>
      }
      actions={
        <>
          <Button size="icon-sm" variant="ghost" onClick={onDelete} title={tr("Excluir projeto")} aria-label={tr("Excluir projeto")}>
            <Trash2 size={13} className="text-danger" />
          </Button>
          <Menu
            trigger={<MoreHorizontal size={15} />}
            items={[
              { label: project.favorite ? tr("Remover dos favoritos") : tr("Favoritar"), icon: Star, onSelect: () => void toggleFavorite(project.id) },
              { label: tr("Editar"), icon: Pencil, onSelect: onEdit },
              { label: tr("Trocar ícone"), icon: ImagePlus, onSelect: onEdit },
              project.archivedAt
                ? { label: tr("Desarquivar"), icon: ArchiveRestore, onSelect: () => void toggleArchive(project) }
                : { label: tr("Arquivar"), icon: Archive, onSelect: () => void toggleArchive(project) },
              "separator",
              { label: tr("Excluir projeto"), icon: Trash2, danger: true, onSelect: onDelete },
            ]}
          />
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          {project.description && <p className="text-sm text-text-muted">{project.description}</p>}
          <p className="break-all font-mono text-[11px] text-text-faint">{project.localPath}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-faint">
            <span>{project.lastOpenedAt ? tr("Aberto {time}", { time: timeAgo(project.lastOpenedAt) }) : tr("Nunca aberto")}</span>
            <span>{tr("Adicionado {time}", { time: timeAgo(project.createdAt) })}</span>
            <button className="inline-flex items-center gap-1 hover:text-text" onClick={() => setFocusDialog("history")} title={tr("Histórico de foco")}>
              <Timer size={11} /> {tr("Foco (7 dias): {time}", { time: formatUsage(focusSeconds) })}
            </button>
          </p>
          <div className="flex flex-wrap gap-1">
            {project.technologies.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button size="sm" onClick={() => void open(project, "vscode")}>
              <Code2 size={13} />{" "}{tr("VS Code")}</Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("workspace", project.id)} title={tr("Abrir no Workspace")}>
              <LayoutDashboard size={13} /> {tr("Workspace")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("editor", project.localPath)} title={tr("Editar no Qyrex")}>
              <FileCode2 size={13} />{" "}{tr("Editor")}</Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("terminal", project.id)}>
              <SquareTerminal size={13} />{" "}{tr("Terminal")}</Button>
            <Button size="sm" variant="secondary" onClick={() => void open(project, "explorer")}>
              <FolderOpen size={13} />{" "}{tr("Explorer")}</Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("automacoes", project.id)} title={tr("Automações deste projeto")}>
              <Workflow size={13} />{" "}{tr("Automações")}</Button>
            {project.githubUrl && (
              <Button size="sm" variant="secondary" onClick={() => void open(project, "github")}>
                <Github size={13} />{" "}{tr("GitHub")}</Button>
            )}
          </div>
        </div>

        {!project.archivedAt && <ProjectScriptsSection projectId={project.id} />}
        {!project.archivedAt && <EnvSection projectId={project.id} projectPath={project.localPath} />}

        <section>
          <p className="section-title mb-2">{tr("Git")}</p>
          {project.archivedAt ? (
            <p className="text-xs text-text-muted">{tr("Projeto arquivado: o Git não é consultado. Desarquive para ver o status.")}</p>
          ) : (
            <GitPanel project={project} onChanged={() => void load()} />
          )}
        </section>

        {project.githubUrl && (
          <section>
            <p className="section-title mb-2">{tr("GitHub")}</p>
            <GitHubSection url={project.githubUrl} />
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="section-title">{tr("Tarefas abertas")}</p>
            <Button size="xs" variant="ghost" onClick={() => setTaskOpen(true)}>
              <Plus size={12} />{" "}{tr("Nova")}</Button>
          </div>
          {projectTasks.length === 0 ? (
            <p className="text-xs text-text-faint">{tr("Nenhuma tarefa aberta neste projeto.")}</p>
          ) : (
            <div className="space-y-1">
              {projectTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={false} onChange={() => void toggleDone(t)} aria-label={tr("Concluir")} />
                  <button className="min-w-0 flex-1 truncate text-left text-text" onClick={() => navigate("tarefas", t.id)}>
                    {t.title}
                  </button>
                  {t.dueDate && <span className="inline-block text-[11px] text-text-faint first-letter:uppercase">{relativeDay(t.dueDate)}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <TaskFormDialog open={taskOpen} onClose={() => setTaskOpen(false)} defaults={{ projectId: project.id }} />
    </Drawer>
  );
}

// --- Página ---------------------------------------------------------------------------

/** Ações secundárias do card/linha (aparecem no hover para o card respirar). */
function QuickActions({ project, className }: { project: ProjectWithGit; className?: string }) {
  const { open } = useProjectsStore();
  const navigate = useUIStore((s) => s.navigate);
  return (
    <span className={cn("flex items-center gap-0.5", className)}>
      <Button size="icon-sm" variant="ghost" onClick={() => navigate("editor", project.localPath)} title={tr("Editar no Qyrex")} aria-label={tr("Editar no Qyrex")}>
        <FileCode2 size={13} />
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={() => navigate("terminal", project.id)} title={tr("Terminal")} aria-label={tr("Terminal")}>
        <SquareTerminal size={13} />
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={() => void open(project, "explorer")} title={tr("Explorer")} aria-label={tr("Explorer")}>
        <FolderOpen size={13} />
      </Button>
      {project.githubUrl && (
        <Button size="icon-sm" variant="ghost" onClick={() => void open(project, "github")} title={tr("GitHub")} aria-label={tr("GitHub")}>
          <Github size={13} />
        </Button>
      )}
    </span>
  );
}

function ProjectMenu({ project, onOpen, onDelete }: { project: ProjectWithGit; onOpen: () => void; onDelete: () => void }) {
  const { toggleFavorite } = useProjectsStore();
  const navigate = useUIStore((s) => s.navigate);
  return (
    <Menu
      trigger={<MoreHorizontal size={15} />}
      label={tr("Mais opções")}
      items={[
        { label: tr("Detalhes"), icon: Code2, onSelect: onOpen },
        { label: tr("Abrir no Workspace"), icon: LayoutDashboard, onSelect: () => navigate("workspace", project.id) },
        { label: project.favorite ? tr("Remover dos favoritos") : tr("Favoritar"), icon: Star, onSelect: () => void toggleFavorite(project.id) },
        project.archivedAt
          ? { label: tr("Desarquivar"), icon: ArchiveRestore, onSelect: () => void toggleArchive(project) }
          : { label: tr("Arquivar"), icon: Archive, onSelect: () => void toggleArchive(project) },
        "separator",
        { label: tr("Excluir projeto"), icon: Trash2, danger: true, onSelect: onDelete },
      ]}
    />
  );
}

function GitLine({ project }: { project: ProjectWithGit }) {
  const git = project.git;
  if (project.archivedAt) return <span>{tr("Arquivado {time}", { time: timeAgo(project.archivedAt) })}</span>;
  if (!git?.isRepo) return <span>{tr("Sem git")}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <GitBranch size={11} className="shrink-0" />
      <span className="truncate font-mono">{git.branch ?? "?"}</span>
      {git.ahead > 0 && (
        <span className="text-accent" title={trn(git.ahead, "{n} commit para enviar", "{n} commits para enviar")}>
          ↑{git.ahead}
        </span>
      )}
      {git.behind > 0 && (
        <span className="text-warning" title={trn(git.behind, "{n} commit para receber", "{n} commits para receber")}>
          ↓{git.behind}
        </span>
      )}
      {git.modifiedCount > 0 && <span className="text-warning">· {trn(git.modifiedCount, "{n} alterado", "{n} alterados")}</span>}
    </span>
  );
}

function ProjectCard({ project, onOpen, onDelete }: { project: ProjectWithGit; onOpen: () => void; onDelete: () => void }) {
  const { open } = useProjectsStore();
  const insights = useProjectInsights(project.id, !project.archivedAt);

  return (
    <Card className="card-interactive group flex flex-col p-4">
      <div className="flex items-start gap-3">
        <ProjectIcon name={project.name} icon={project.icon} size={36} />
        <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <span className="truncate">{project.name}</span>
            {project.favorite && <Star size={12} className="shrink-0 fill-warning text-warning" />}
            <StatusBadge project={project} />
          </p>
          <p className="mt-0.5 line-clamp-2 min-h-[2.2em] text-xs text-text-muted">{project.description || project.localPath}</p>
        </button>
        <ProjectMenu project={project} onOpen={onOpen} onDelete={onDelete} />
      </div>

      {!project.archivedAt && <LanguageBar insights={insights} className="mt-3" />}

      <div className="mt-3 flex items-end justify-between gap-3 text-[11px] text-text-faint">
        <div className="min-w-0 space-y-0.5">
          <GitLine project={project} />
          {insights?.lastCommit ? (
            <p className="truncate" title={insights.lastCommit.subject}>
              {insights.lastCommit.subject} · {timeAgo(insights.lastCommit.date)}
            </p>
          ) : (
            <p>{project.lastOpenedAt ? tr("Aberto {time}", { time: timeAgo(project.lastOpenedAt) }) : tr("Nunca aberto")}</p>
          )}
        </div>
        {!project.archivedAt && project.git?.isRepo && <CommitSparkline weekly={insights?.weeklyCommits} className="shrink-0" />}
      </div>

      <div className="mt-3 flex items-center gap-1 border-t border-border-subtle pt-3">
        <Button size="xs" onClick={() => void open(project, "vscode")}>
          <Code2 size={12} /> {tr("VS Code")}
        </Button>
        <QuickActions project={project} className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100" />
        <Button size="xs" variant="ghost" className="ml-auto" onClick={onOpen}>
          {tr("Detalhes")}
        </Button>
      </div>
    </Card>
  );
}

/** Linha da visão em lista: tudo numa faixa, para quem tem muitos projetos. */
function ProjectRow({ project, onOpen, onDelete }: { project: ProjectWithGit; onOpen: () => void; onDelete: () => void }) {
  const { open } = useProjectsStore();
  const insights = useProjectInsights(project.id, !project.archivedAt);
  return (
    <div className="group flex items-center gap-3 border-b border-border-subtle px-3 py-2.5 last:border-b-0 hover:bg-bg-hover/50">
      <ProjectIcon name={project.name} icon={project.icon} size={28} className="rounded-md" />
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className="flex items-center gap-1.5 text-sm font-medium text-text">
          <span className="truncate">{project.name}</span>
          {project.favorite && <Star size={11} className="shrink-0 fill-warning text-warning" />}
          <StatusBadge project={project} />
        </p>
        <p className="truncate text-[11px] text-text-faint">{insights?.lastCommit?.subject ?? project.description ?? project.localPath}</p>
      </button>
      <div className="hidden w-28 shrink-0 lg:block">{!project.archivedAt && <LanguageBar insights={insights} legend={0} />}</div>
      <div className="hidden w-44 shrink-0 text-[11px] text-text-faint md:block">
        <GitLine project={project} />
      </div>
      <div className="hidden w-[70px] shrink-0 xl:block">{!project.archivedAt && project.git?.isRepo && <CommitSparkline weekly={insights?.weeklyCommits} />}</div>
      <span className="w-24 shrink-0 text-right text-[11px] text-text-faint">{project.lastOpenedAt ? timeAgo(project.lastOpenedAt) : "—"}</span>
      {/* Largura fixa: com ou sem GitHub, as colunas da lista continuam alinhadas. */}
      <QuickActions project={project} className="w-[104px] shrink-0 justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100" />
      <Button size="xs" variant="secondary" onClick={() => void open(project, "vscode")}>
        <Code2 size={12} /> {tr("VS Code")}
      </Button>
      <ProjectMenu project={project} onOpen={onOpen} onDelete={onDelete} />
    </div>
  );
}

const VIEW_KEY = "qrz.projectsView";
function readView(): "grade" | "lista" {
  try {
    return localStorage.getItem(VIEW_KEY) === "lista" ? "lista" : "grade";
  } catch {
    return "grade";
  }
}

export function Projects() {
  const { projects, loaded, loading, error, load } = useProjectsStore();
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectWithGit | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useState<"ativos" | "arquivados">("ativos");
  const [layout, setLayoutState] = useState<"grade" | "lista">(readView);
  const setLayout = (next: "grade" | "lista") => {
    setLayoutState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // sem storage: vale só nesta sessão
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  // "new" abre o diálogo; um id abre o drawer do projeto.
  useEffect(() => {
    if (!pageParam) return;
    if (pageParam === "new") setFormOpen(true);
    else setDetailId(pageParam);
  }, [pageParam]);

  const archivedCount = projects.filter((p) => p.archivedAt).length;
  const showArchived = view === "arquivados" && archivedCount > 0;
  const sorted = useMemo(() => {
    const list = projects.filter((p) => Boolean(p.archivedAt) === showArchived).sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)
    );
    return fuzzyFilter(list, search, (p) => `${p.name} ${p.description ?? ""} ${p.technologies.join(" ")}`);
  }, [projects, search, showArchived]);

  const favorites = sorted.filter((p) => p.favorite);
  const others = sorted.filter((p) => !p.favorite);
  const detail = projects.find((p) => p.id === detailId) ?? null;

  useEffect(() => {
    if (detailId && loaded && !projects.some((p) => p.id === detailId)) {
      toast.error(tr("Projeto não encontrado."));
      setDetailId(null);
    }
  }, [detailId, loaded, projects]);

  async function deleteProject(project: ProjectWithGit) {
    if (!(await confirmDeleteProject(project))) return;
    // Fecha o que estiver aberto antes da lista recarregar (senão o drawer acusaria "não encontrado").
    setEditing(null);
    setFormOpen(false);
    if (detailId === project.id) setDetailId(null);
    if (pageParam) navigate("projetos");
  }

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    if (pageParam === "new") navigate("projetos");
  };

  const grid = (items: ProjectWithGit[]) =>
    layout === "lista" ? (
      <Card className="overflow-hidden">
        {items.map((p) => (
          <ProjectRow key={p.id} project={p} onOpen={() => setDetailId(p.id)} onDelete={() => void deleteProject(p)} />
        ))}
      </Card>
    ) : (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <ProjectCard key={p.id} project={p} onOpen={() => setDetailId(p.id)} onDelete={() => void deleteProject(p)} />
        ))}
      </div>
    );

  return (
    <div>
      <PageHeader
        title={tr("Projetos")}
        icon={PAGE_ICONS.projetos}
        description={trn(projects.length - archivedCount, "{n} projeto no Qyrex", "{n} projetos no Qyrex")}
        actions={
          <>
            {archivedCount > 0 && (
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "ativos", label: tr("Ativos") },
                  { value: "arquivados", label: tr("Arquivados"), count: archivedCount },
                ]}
              />
            )}
            <Segmented
              value={layout}
              onChange={setLayout}
              options={[
                { value: "grade", label: <LayoutGrid size={13} aria-label={tr("Grade")} /> },
                { value: "lista", label: <List size={13} aria-label={tr("Lista")} /> },
              ]}
            />
            <input className="input w-56 py-1 text-xs" placeholder={tr("Filtrar projetos...")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button size="sm" variant="ghost" onClick={() => void load()} title={tr("Atualizar status git")}>
              {loading ? <Spinner /> : <RefreshCw size={13} />}
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus size={14} />{" "}{tr("Novo projeto")}</Button>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loaded && loading ? (
        <LoadingRows rows={4} />
      ) : projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={Code2}
            title={tr("Nenhum projeto ainda")}
            description={tr("Adicione a pasta de um projeto para abrir no VS Code, no terminal e acompanhar o git em um clique.")}
            action={
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus size={14} />{" "}{tr("Adicionar projeto")}</Button>
            }
          />
        </Card>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Code2} title={tr("Nenhum projeto encontrado")} />
      ) : (
        <div className="space-y-6">
          {favorites.length > 0 && (
            <section>
              <p className="section-title mb-2">{tr("Favoritos")}</p>
              {grid(favorites)}
            </section>
          )}
          {others.length > 0 && (
            <section>
              {favorites.length > 0 && <p className="section-title mb-2">{tr("Todos")}</p>}
              {grid(others)}
            </section>
          )}
        </div>
      )}

      <ProjectFormDialog open={formOpen || !!editing} project={editing} onClose={closeForm} onDelete={(p) => void deleteProject(p)} />

      {detail && (
        <ProjectDrawer
          project={detail}
          onClose={() => {
            setDetailId(null);
            if (pageParam) navigate("projetos");
          }}
          onEdit={() => setEditing(detail)}
          onDelete={() => void deleteProject(detail)}
        />
      )}
    </div>
  );
}
