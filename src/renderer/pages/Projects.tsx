import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Code2,
  ExternalLink,
  FolderOpen,
  FolderSearch,
  GitBranch,
  GitCommitHorizontal,
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
} from "lucide-react";
import type { GitChangedFile, GitCommit, GitHubOverview, ProjectWithGit } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, Drawer, EmptyState, ErrorState, Field, LoadingRows, Menu, PageHeader, Spinner } from "@/components/ui/primitives";
import { TaskFormDialog } from "@/components/TaskFormDialog";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeDay, timeAgo } from "@/lib/format";
import { fuzzyFilter } from "@/lib/fuzzy";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { useTasksStore } from "@/stores/useTasksStore";
import { confirmAction, toast, useUIStore } from "@/stores/useUIStore";

// --- Diálogo de criação/edição ------------------------------------------------------

function ProjectFormDialog({ open, project, onClose }: { open: boolean; project: ProjectWithGit | null; onClose: () => void }) {
  const { create, update } = useProjectsStore();
  const clients = useClientsStore((s) => s.clients);

  const [localPath, setLocalPath] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [technologies, setTechnologies] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocalPath(project?.localPath ?? "");
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setTechnologies(project?.technologies.join(", ") ?? "");
    setGithubUrl(project?.githubUrl ?? "");
    setClientId(project?.clientId ?? "");
  }, [open, project]);

  async function pickFolder() {
    const dir = await attempt(window.workspace.system.pickDirectory("Pasta do projeto"));
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
  }

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
      title={project ? "Editar projeto" : "Novo projeto"}
      description={project ? undefined : "Escolha a pasta: nome, tecnologias e GitHub são detectados automaticamente."}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!name.trim() || !localPath}>
            {project ? "Salvar" : "Adicionar projeto"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Pasta" hint={project ? "A pasta de um projeto existente não pode ser trocada." : "Precisa estar dentro de um diretório autorizado."}>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" value={localPath} readOnly placeholder="Nenhuma pasta escolhida" />
            {!project && (
              <Button variant="secondary" size="md" onClick={pickFolder} loading={detecting}>
                <FolderSearch size={14} /> Escolher
              </Button>
            )}
          </div>
        </Field>
        <Field label="Nome">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-projeto" />
        </Field>
        <Field label="Descrição">
          <textarea className="input min-h-[60px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tecnologias" hint="Separe por vírgula">
            <input className="input" value={technologies} onChange={(e) => setTechnologies(e.target.value)} placeholder="React, TypeScript" />
          </Field>
          <Field label="Cliente">
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Nenhum</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Repositório no GitHub">
          <input className="input" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/usuario/repo" />
        </Field>
      </div>
    </Dialog>
  );
}

// --- Drawer de detalhes -------------------------------------------------------------

function GitSection({ project, onChanged }: { project: ProjectWithGit; onChanged: () => void }) {
  const [changes, setChanges] = useState<GitChangedFile[] | null>(null);
  const [commits, setCommits] = useState<GitCommit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [stageAll, setStageAll] = useState(true);
  const [busy, setBusy] = useState<"commit" | "pull" | "push" | null>(null);
  const git = project.git;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, l] = await Promise.all([
        unwrap(window.workspace.git.changes(project.localPath)),
        unwrap(window.workspace.git.commits(project.localPath, 8)),
      ]);
      setChanges(c);
      setCommits(l);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [project.localPath]);

  useEffect(() => {
    if (git?.isRepo) void load();
  }, [git?.isRepo, load]);

  if (!git?.isRepo) {
    return <p className="text-xs text-text-muted">Esta pasta não é um repositório git.</p>;
  }

  async function doCommit() {
    const msg = message.trim();
    if (!msg) return;
    const ok = await confirmAction({
      title: "Criar commit?",
      description: stageAll ? "Todas as alterações serão adicionadas (git add -A) e commitadas." : "Somente o que já está no stage será commitado.",
      detail: msg,
      danger: true,
      confirmLabel: "Commitar",
    });
    if (!ok) return;
    setBusy("commit");
    const out = await attempt(window.workspace.git.commit({ projectPath: project.localPath, message: msg, stageAll, confirmed: true }), "Commit criado");
    setBusy(null);
    if (out !== undefined) {
      setMessage("");
      void load();
      onChanged();
    }
  }

  async function remote(op: "pull" | "push") {
    const ok = await confirmAction({
      title: op === "pull" ? "Fazer pull?" : "Fazer push?",
      description:
        op === "pull"
          ? `Baixa e integra as alterações do remoto na branch ${git?.branch ?? "atual"}.`
          : `Envia os commits locais da branch ${git?.branch ?? "atual"} para o remoto (nunca com --force).`,
      detail: project.localPath,
      danger: true,
      confirmLabel: op === "pull" ? "Pull" : "Push",
    });
    if (!ok) return;
    setBusy(op);
    const input = { projectPath: project.localPath, confirmed: true as const };
    const out = await attempt(op === "pull" ? window.workspace.git.pull(input) : window.workspace.git.push(input), op === "pull" ? "Pull concluído" : "Push concluído");
    setBusy(null);
    if (out !== undefined) {
      void load();
      onChanged();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="accent">
          <GitBranch size={11} /> {git.branch ?? "(sem branch)"}
        </Badge>
        {git.modifiedCount > 0 ? <Badge tone="warning">{git.modifiedCount} alterado(s)</Badge> : <Badge tone="success">Limpo</Badge>}
        {git.ahead > 0 && <Badge>↑ {git.ahead}</Badge>}
        {git.behind > 0 && <Badge>↓ {git.behind}</Badge>}
        <div className="ml-auto flex gap-1.5">
          <Button size="xs" variant="secondary" onClick={() => void remote("pull")} loading={busy === "pull"} disabled={!git.remoteUrl || busy !== null}>
            <ArrowDownToLine size={12} /> Pull
          </Button>
          <Button size="xs" variant="secondary" onClick={() => void remote("push")} loading={busy === "push"} disabled={!git.remoteUrl || busy !== null}>
            <ArrowUpFromLine size={12} /> Push
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => void load()} title="Atualizar">
            <RefreshCw size={12} />
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {changes === null ? (
        <LoadingRows rows={2} />
      ) : changes.length > 0 ? (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border-subtle bg-bg">
          {changes.map((c) => (
            <div key={c.path} className="flex items-center gap-2 px-2.5 py-1 font-mono text-[11px]">
              <span className="w-5 shrink-0 text-warning">{c.status}</span>
              <span className="truncate text-text-muted">{c.path}</span>
            </div>
          ))}
        </div>
      ) : null}

      {changes && changes.length > 0 && (
        <div className="space-y-2">
          <textarea
            className="input min-h-[56px] resize-y"
            placeholder="Mensagem do commit"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input type="checkbox" className="accent-accent" checked={stageAll} onChange={(e) => setStageAll(e.target.checked)} />
              Adicionar todas as alterações
            </label>
            <Button size="sm" onClick={() => void doCommit()} disabled={!message.trim() || busy !== null} loading={busy === "commit"}>
              <GitCommitHorizontal size={13} /> Commit
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="section-title mb-1.5">Commits recentes</p>
        {commits === null ? (
          <LoadingRows rows={2} />
        ) : commits.length === 0 ? (
          <p className="text-xs text-text-faint">Nenhum commit ainda.</p>
        ) : (
          <div className="space-y-1">
            {commits.map((c) => (
              <div key={c.hash} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-mono text-text-faint">{c.shortHash}</span>
                <span className="min-w-0 flex-1 truncate text-text">{c.subject}</span>
                <span className="shrink-0 text-[11px] text-text-faint">{timeAgo(c.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
        <Button size="xs" variant="ghost" onClick={() => navigate("integracoes")}>
          Configurar GitHub em Integrações
        </Button>
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
        {data.repo.private && <Badge>Privado</Badge>}
        <span>★ {data.repo.stars}</span>
        <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => open(data.repo.htmlUrl)} title="Abrir no GitHub">
          <ExternalLink size={12} />
        </Button>
      </div>
      <div>
        <p className="section-title mb-1">Pull requests abertos</p>
        {list(data.pulls, GitPullRequest, "Nenhum PR aberto.")}
      </div>
      <div>
        <p className="section-title mb-1">Issues abertas</p>
        {list(data.issues, CircleDot, "Nenhuma issue aberta.")}
      </div>
    </div>
  );
}

function ProjectDrawer({ project, onClose, onEdit }: { project: ProjectWithGit; onClose: () => void; onEdit: () => void }) {
  const { open, remove, load, toggleFavorite } = useProjectsStore();
  const { tasks, loaded: tasksLoaded, load: loadTasks, toggleDone } = useTasksStore();
  const clients = useClientsStore((s) => s.clients);
  const navigate = useUIStore((s) => s.navigate);
  const [taskOpen, setTaskOpen] = useState(false);

  useEffect(() => {
    if (!tasksLoaded) void loadTasks();
  }, [tasksLoaded, loadTasks]);

  const projectTasks = tasks.filter((t) => t.projectId === project.id && t.status !== "concluido");
  const client = clients.find((c) => c.id === project.clientId);

  async function handleRemove() {
    const ok = await confirmAction({
      title: `Remover "${project.name}" do Workspace?`,
      description: "Só o cadastro é removido. Nenhum arquivo da pasta é apagado.",
      detail: project.localPath,
      danger: true,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    await remove(project.id);
    onClose();
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={560}
      title={
        <span className="flex items-center gap-2">
          {project.name}
          {project.favorite && <Star size={13} className="fill-warning text-warning" />}
        </span>
      }
      actions={
        <Menu
          trigger={<MoreHorizontal size={15} />}
          items={[
            { label: project.favorite ? "Remover dos favoritos" : "Favoritar", icon: Star, onSelect: () => void toggleFavorite(project.id) },
            { label: "Editar", icon: Pencil, onSelect: onEdit },
            "separator",
            { label: "Remover do Workspace", icon: Trash2, danger: true, onSelect: () => void handleRemove() },
          ]}
        />
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
              <Code2 size={13} /> VS Code
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("terminal", project.id)}>
              <SquareTerminal size={13} /> Terminal
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void open(project, "explorer")}>
              <FolderOpen size={13} /> Explorer
            </Button>
            {project.githubUrl && (
              <Button size="sm" variant="secondary" onClick={() => void open(project, "github")}>
                <Github size={13} /> GitHub
              </Button>
            )}
          </div>
        </div>

        <section>
          <p className="section-title mb-2">Git</p>
          <GitSection project={project} onChanged={() => void load()} />
        </section>

        {project.githubUrl && (
          <section>
            <p className="section-title mb-2">GitHub</p>
            <GitHubSection url={project.githubUrl} />
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="section-title">Tarefas abertas</p>
            <Button size="xs" variant="ghost" onClick={() => setTaskOpen(true)}>
              <Plus size={12} /> Nova
            </Button>
          </div>
          {projectTasks.length === 0 ? (
            <p className="text-xs text-text-faint">Nenhuma tarefa aberta neste projeto.</p>
          ) : (
            <div className="space-y-1">
              {projectTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-accent" checked={false} onChange={() => void toggleDone(t)} aria-label="Concluir" />
                  <button className="min-w-0 flex-1 truncate text-left text-text" onClick={() => navigate("tarefas", t.id)}>
                    {t.title}
                  </button>
                  {t.dueDate && <span className="text-[11px] capitalize text-text-faint">{relativeDay(t.dueDate)}</span>}
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

function ProjectCard({ project, onOpen }: { project: ProjectWithGit; onOpen: () => void }) {
  const { open, toggleFavorite } = useProjectsStore();
  const navigate = useUIStore((s) => s.navigate);
  const git = project.git;

  return (
    <Card className="group flex flex-col p-4 transition-colors hover:border-border">
      <div className="flex items-start gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <p className="truncate text-sm font-semibold text-text">{project.name}</p>
          <p className="mt-0.5 line-clamp-2 min-h-[2.2em] text-xs text-text-muted">{project.description || project.localPath}</p>
        </button>
        <button
          onClick={() => void toggleFavorite(project.id)}
          className={cn("rounded-md p-1 transition-colors hover:bg-bg-hover", project.favorite ? "text-warning" : "text-text-faint opacity-0 group-hover:opacity-100")}
          aria-label={project.favorite ? "Remover dos favoritos" : "Favoritar"}
        >
          <Star size={14} className={project.favorite ? "fill-warning" : ""} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {project.technologies.slice(0, 4).map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
        {project.technologies.length > 4 && <Badge>+{project.technologies.length - 4}</Badge>}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-text-faint">
        {git?.isRepo ? (
          <>
            <GitBranch size={11} /> {git.branch ?? "?"}
            {git.modifiedCount > 0 && <span className="text-warning">· {git.modifiedCount} alterado(s)</span>}
          </>
        ) : (
          <span>Sem git</span>
        )}
        <span className="ml-auto">{project.lastOpenedAt ? `Aberto ${timeAgo(project.lastOpenedAt)}` : "Nunca aberto"}</span>
      </div>

      <div className="mt-3 flex gap-1.5 border-t border-border-subtle pt-3">
        <Button size="xs" onClick={() => void open(project, "vscode")}>
          <Code2 size={12} /> VS Code
        </Button>
        <Button size="xs" variant="secondary" onClick={() => navigate("terminal", project.id)} title="Terminal">
          <SquareTerminal size={12} />
        </Button>
        <Button size="xs" variant="secondary" onClick={() => void open(project, "explorer")} title="Explorer">
          <FolderOpen size={12} />
        </Button>
        {project.githubUrl && (
          <Button size="xs" variant="secondary" onClick={() => void open(project, "github")} title="GitHub">
            <Github size={12} />
          </Button>
        )}
        <Button size="xs" variant="ghost" className="ml-auto" onClick={onOpen}>
          Detalhes
        </Button>
      </div>
    </Card>
  );
}

export function Projects() {
  const { projects, loaded, loading, error, load } = useProjectsStore();
  const { loaded: clientsLoaded, load: loadClients } = useClientsStore();
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectWithGit | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    void load();
    if (!clientsLoaded) void loadClients();
  }, [load, clientsLoaded, loadClients]);

  // "new" abre o diálogo; um id abre o drawer do projeto.
  useEffect(() => {
    if (!pageParam) return;
    if (pageParam === "new") setFormOpen(true);
    else setDetailId(pageParam);
  }, [pageParam]);

  const sorted = useMemo(() => {
    const list = [...projects].sort(
      (a, b) => Number(b.favorite) - Number(a.favorite) || (b.lastOpenedAt ?? b.createdAt).localeCompare(a.lastOpenedAt ?? a.createdAt)
    );
    return fuzzyFilter(list, search, (p) => `${p.name} ${p.description ?? ""} ${p.technologies.join(" ")}`);
  }, [projects, search]);

  const favorites = sorted.filter((p) => p.favorite);
  const others = sorted.filter((p) => !p.favorite);
  const detail = projects.find((p) => p.id === detailId) ?? null;

  useEffect(() => {
    if (detailId && loaded && !projects.some((p) => p.id === detailId)) {
      toast.error("Projeto não encontrado.");
      setDetailId(null);
    }
  }, [detailId, loaded, projects]);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    if (pageParam === "new") navigate("projetos");
  };

  const grid = (items: ProjectWithGit[]) => (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((p) => (
        <ProjectCard key={p.id} project={p} onOpen={() => setDetailId(p.id)} />
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Projetos"
        description={`${projects.length} projeto(s) no Workspace`}
        actions={
          <>
            <input className="input w-56 py-1 text-xs" placeholder="Filtrar projetos..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button size="sm" variant="ghost" onClick={() => void load()} title="Atualizar status git">
              {loading ? <Spinner /> : <RefreshCw size={13} />}
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus size={14} /> Novo projeto
            </Button>
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
            title="Nenhum projeto ainda"
            description="Adicione a pasta de um projeto para abrir no VS Code, no terminal e acompanhar o git em um clique."
            action={
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus size={14} /> Adicionar projeto
              </Button>
            }
          />
        </Card>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Code2} title="Nenhum projeto encontrado" />
      ) : (
        <div className="space-y-6">
          {favorites.length > 0 && (
            <section>
              <p className="section-title mb-2">Favoritos</p>
              {grid(favorites)}
            </section>
          )}
          {others.length > 0 && (
            <section>
              {favorites.length > 0 && <p className="section-title mb-2">Todos</p>}
              {grid(others)}
            </section>
          )}
        </div>
      )}

      <ProjectFormDialog open={formOpen || !!editing} project={editing} onClose={closeForm} />

      {detail && (
        <ProjectDrawer
          project={detail}
          onClose={() => {
            setDetailId(null);
            if (pageParam) navigate("projetos");
          }}
          onEdit={() => setEditing(detail)}
        />
      )}
    </div>
  );
}
