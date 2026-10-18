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
  ImagePlus,
  ScanSearch,
} from "lucide-react";
import type { GitHubOverview, ProjectIconMode, ProjectStatus, ProjectWithGit } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, Drawer, EmptyState, ErrorState, Field, LoadingRows, Menu, PageHeader, ProjectIcon, Segmented, Spinner } from "@/components/ui/primitives";
import { TaskFormDialog } from "@/components/TaskFormDialog";
import { GitPanel } from "@/components/GitPanel";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeDay, timeAgo } from "@/lib/format";
import { fuzzyFilter } from "@/lib/fuzzy";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useBusinessMode } from "@/stores/useSettingsStore";
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
  const clients = useClientsStore((s) => s.clients);
  const businessMode = useBusinessMode();

  const [localPath, setLocalPath] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [technologies, setTechnologies] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [clientId, setClientId] = useState("");
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
    setClientId(project?.clientId ?? "");
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
          clientId: clientId || null,
          status,
        })
      : await create({
          name: name.trim(),
          description: description.trim() || undefined,
          localPath,
          technologies: techList,
          githubUrl: githubUrl.trim() || undefined,
          clientId: clientId || undefined,
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
          {businessMode && (
            <Field label={tr("Cliente")}>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">{tr("Nenhum")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
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
  const clients = useClientsStore((s) => s.clients);
  const businessMode = useBusinessMode();
  const navigate = useUIStore((s) => s.navigate);
  const [taskOpen, setTaskOpen] = useState(false);

  useEffect(() => {
    if (!tasksLoaded) void loadTasks();
  }, [tasksLoaded, loadTasks]);

  const projectTasks = tasks.filter((t) => t.projectId === project.id && t.status !== "concluido");
  const client = businessMode ? clients.find((c) => c.id === project.clientId) : undefined;

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
          <div className="flex flex-wrap gap-1">
            {project.technologies.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            {client && (
              <button onClick={() => navigate("clientes", client.id)}>
                <Badge tone="accent">{client.name}</Badge>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button size="sm" onClick={() => void open(project, "vscode")}>
              <Code2 size={13} />{" "}{tr("VS Code")}</Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("editor", project.localPath)} title={tr("Editar no Qyrex")}>
              <FileCode2 size={13} />{" "}{tr("Editor")}</Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("terminal", project.id)}>
              <SquareTerminal size={13} />{" "}{tr("Terminal")}</Button>
            <Button size="sm" variant="secondary" onClick={() => void open(project, "explorer")}>
              <FolderOpen size={13} />{" "}{tr("Explorer")}</Button>
            {project.githubUrl && (
              <Button size="sm" variant="secondary" onClick={() => void open(project, "github")}>
                <Github size={13} />{" "}{tr("GitHub")}</Button>
            )}
          </div>
        </div>

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
      <TaskFormDialog open={taskOpen} onClose={() => setTaskOpen(false)} defaults={{ projectId: project.id, clientId: project.clientId }} />
    </Drawer>
  );
}

// --- Página ---------------------------------------------------------------------------

function ProjectCard({ project, onOpen, onDelete }: { project: ProjectWithGit; onOpen: () => void; onDelete: () => void }) {
  const { open, toggleFavorite } = useProjectsStore();
  const navigate = useUIStore((s) => s.navigate);
  const git = project.git;

  return (
    <Card className="card-interactive group flex flex-col p-4">
      <div className="flex items-start gap-2.5">
        <ProjectIcon name={project.name} icon={project.icon} size={34} />
        <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
            <span className="truncate">{project.name}</span>
            <StatusBadge project={project} />
          </p>
          <p className="mt-0.5 line-clamp-2 min-h-[2.2em] text-xs text-text-muted">{project.description || project.localPath}</p>
        </button>
        <button
          onClick={() => void toggleFavorite(project.id)}
          className={cn("rounded-md p-1 transition-colors hover:bg-bg-hover", project.favorite ? "text-warning" : "text-text-faint opacity-0 group-hover:opacity-100")}
          aria-label={project.favorite ? tr("Remover dos favoritos") : tr("Favoritar")}
        >
          <Star size={14} className={project.favorite ? "fill-warning" : ""} />
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1 text-text-faint opacity-0 transition-colors hover:bg-bg-hover hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
          title={tr("Excluir projeto")}
          aria-label={tr("Excluir projeto")}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {project.technologies.slice(0, 4).map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
        {project.technologies.length > 4 && <Badge>+{project.technologies.length - 4}</Badge>}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-text-faint">
        {project.archivedAt ? (
          <span>{tr("Arquivado {time}", { time: timeAgo(project.archivedAt) })}</span>
        ) : git?.isRepo ? (
          <>
            <GitBranch size={11} /> {git.branch ?? "?"}
            {git.modifiedCount > 0 && <span className="text-warning">· {trn(git.modifiedCount, "{n} alterado", "{n} alterados")}</span>}
          </>
        ) : (
          <span>{tr("Sem git")}</span>
        )}
        <span className="ml-auto">{project.lastOpenedAt ? tr("Aberto {time}", { time: timeAgo(project.lastOpenedAt) }) : tr("Nunca aberto")}</span>
      </div>

      <div className="mt-3 flex gap-1.5 border-t border-border-subtle pt-3">
        <Button size="xs" onClick={() => void open(project, "vscode")}>
          <Code2 size={12} />{" "}{tr("VS Code")}</Button>
        <Button size="xs" variant="secondary" onClick={() => navigate("editor", project.localPath)} title={tr("Editar no Qyrex")}>
          <FileCode2 size={12} />
        </Button>
        <Button size="xs" variant="secondary" onClick={() => navigate("terminal", project.id)} title={tr("Terminal")}>
          <SquareTerminal size={12} />
        </Button>
        <Button size="xs" variant="secondary" onClick={() => void open(project, "explorer")} title={tr("Explorer")}>
          <FolderOpen size={12} />
        </Button>
        {project.githubUrl && (
          <Button size="xs" variant="secondary" onClick={() => void open(project, "github")} title={tr("GitHub")}>
            <Github size={12} />
          </Button>
        )}
        {project.archivedAt && (
          <Button size="xs" variant="secondary" onClick={() => void toggleArchive(project)} title={tr("Desarquivar")}>
            <ArchiveRestore size={12} />
          </Button>
        )}
        <Button size="xs" variant="ghost" className="ml-auto" onClick={onOpen}>{tr("Detalhes")}</Button>
      </div>
    </Card>
  );
}

export function Projects() {
  const { projects, loaded, loading, error, load } = useProjectsStore();
  const { loaded: clientsLoaded, load: loadClients } = useClientsStore();
  const businessMode = useBusinessMode();
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectWithGit | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useState<"ativos" | "arquivados">("ativos");

  useEffect(() => {
    void load();
    if (businessMode && !clientsLoaded) void loadClients();
  }, [load, clientsLoaded, businessMode, loadClients]);

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

  const grid = (items: ProjectWithGit[]) => (
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
