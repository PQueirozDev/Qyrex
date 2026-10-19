import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  CloudDownload,
  Code2,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  RefreshCw,
} from "lucide-react";
import type { GitBranch as Branch, GitChangedFile, GitCommit, GitDiff, ProjectWithGit } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Badge, ErrorState, LoadingRows, Menu, Spinner } from "@/components/ui/primitives";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { tr, trn } from "@/lib/i18n";
import { confirmAction, promptText } from "@/stores/useUIStore";
import { tm } from "@shared/i18n";

const OPERATION_LABEL = { merge: tm("Merge"), rebase: tm("Rebase"), "cherry-pick": tm("Cherry-pick") } as const;

/** Diff unificado colorido por linha. */
function DiffView({ diff }: { diff: GitDiff }) {
  if (diff.binary) return <p className="px-3 py-2 text-xs text-text-faint">{tr("Arquivo binário: sem diff de texto.")}</p>;
  if (!diff.diff) {
    return (
      <p className="px-3 py-2 text-xs text-text-faint">
        {diff.truncated ? tr("Arquivo grande demais para mostrar aqui. Abra no VS Code.") : tr("Sem diferenças de texto.")}
      </p>
    );
  }
  // Cabeçalhos do git (diff --git, index, ---/+++) não ajudam a ler a mudança.
  const lines = diff.diff.split("\n").filter((l) => !/^(diff --git|index |--- |\+\+\+ |similarity index|rename (from|to) )/.test(l));
  return (
    <div className="max-h-72 overflow-auto bg-bg font-mono text-[11px] leading-[1.55]">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            "whitespace-pre px-3",
            line.startsWith("+") && "bg-success/10 text-success",
            line.startsWith("-") && "bg-danger/10 text-danger",
            line.startsWith("@@") && "mt-1 text-accent",
            !/^[+\-@]/.test(line) && "text-text-muted"
          )}
        >
          {line || " "}
        </div>
      ))}
      {diff.truncated && <p className="px-3 py-1 text-text-faint">{tr("… diff cortado (muito grande).")}</p>}
    </div>
  );
}

/** Caminhos que um commit dos arquivos escolhidos precisa levar (renomeação leva o nome antigo junto). */
function commitPaths(files: GitChangedFile[]): string[] {
  return files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));
}

export function GitPanel({ project, onChanged }: { project: ProjectWithGit; onChanged: () => void }) {
  const [changes, setChanges] = useState<GitChangedFile[] | null>(null);
  const [commits, setCommits] = useState<GitCommit[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openDiff, setOpenDiff] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [busy, setBusy] = useState<"commit" | "pull" | "push" | "fetch" | "branch" | null>(null);
  // Caminhos vistos na última carga: um arquivo que aparece depois já entra marcado.
  const known = useRef<Set<string>>(new Set());
  const diffRequest = useRef(0);
  const git = project.git;
  const repo = project.localPath;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, l, b] = await Promise.all([unwrap(window.workspace.git.changes(repo)), unwrap(window.workspace.git.commits(repo, 8)), unwrap(window.workspace.git.branches(repo))]);
      setChanges(c);
      setCommits(l);
      setBranches(b);
      // Por padrão tudo vem marcado; arquivos que sumiram saem da seleção.
      setSelected((prev) => {
        const paths = c.map((f) => f.path);
        if (prev.size === 0) return new Set(paths);
        return new Set(paths.filter((p) => prev.has(p) || !known.current.has(p)));
      });
      known.current = new Set(c.map((f) => f.path));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [repo]);

  useEffect(() => {
    if (git?.isRepo) void load();
  }, [git?.isRepo, load]);

  const selectedFiles = useMemo(() => (changes ?? []).filter((f) => selected.has(f.path)), [changes, selected]);

  if (!git?.isRepo) {
    return <p className="text-xs text-text-muted">{tr("Esta pasta não é um repositório git.")}</p>;
  }

  async function refreshAll() {
    await load();
    onChanged();
  }

  async function toggleDiff(file: string) {
    if (openDiff === file) {
      setOpenDiff(null);
      return;
    }
    setOpenDiff(file);
    setDiff(null);
    setDiffLoading(true);
    const request = ++diffRequest.current;
    const result = await attempt(window.workspace.git.diff({ projectPath: repo, file }));
    // Outro arquivo foi aberto enquanto este carregava: descarta a resposta velha.
    if (request !== diffRequest.current) return;
    setDiffLoading(false);
    setDiff(result ?? null);
  }

  function toggleFile(file: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }

  async function doCommit() {
    const msg = message.trim();
    if (!msg || selectedFiles.length === 0) return;
    const ok = await confirmAction({
      title: tr("Criar commit?"),
      description: trn(selectedFiles.length, "Só o arquivo marcado entra no commit.", "Só os {n} arquivos marcados entram no commit."),
      detail: `${msg}\n\n${selectedFiles.map((f) => `${f.status.padEnd(2)} ${f.path}`).join("\n")}`,
      danger: true,
      confirmLabel: tr("Commitar"),
    });
    if (!ok) return;
    setBusy("commit");
    const out = await attempt(
      window.workspace.git.commit({ projectPath: repo, message: msg, stageAll: false, files: commitPaths(selectedFiles), confirmed: true }),
      tr("Commit criado")
    );
    setBusy(null);
    if (out !== undefined) {
      setMessage("");
      setOpenDiff(null);
      await refreshAll();
    }
  }

  async function remote(op: "pull" | "push") {
    const branch = git?.branch ?? tr("atual");
    const ok = await confirmAction({
      title: op === "pull" ? tr("Fazer pull?") : tr("Fazer push?"),
      description:
        op === "pull"
          ? tr("Baixa e integra as alterações do remoto na branch {branch}.", { branch })
          : git?.upstream
            ? tr("Envia os commits locais da branch {branch} para o remoto (nunca com --force).", { branch })
            : tr("A branch {branch} ainda não existe no remoto: será publicada em origin/{branch} (nunca com --force).", { branch }),
      detail: repo,
      danger: true,
      confirmLabel: op === "pull" ? tr("Pull") : tr("Push"),
    });
    if (!ok) return;
    setBusy(op);
    const input = { projectPath: repo, confirmed: true as const };
    const out = await attempt(op === "pull" ? window.workspace.git.pull(input) : window.workspace.git.push(input), op === "pull" ? tr("Pull concluído") : tr("Push concluído"));
    setBusy(null);
    if (out !== undefined) await refreshAll();
  }

  async function fetchRemote() {
    setBusy("fetch");
    const out = await attempt(window.workspace.git.fetch(repo), tr("Remoto atualizado"));
    setBusy(null);
    if (out) onChanged();
  }

  async function switchTo(name: string) {
    const ok = await confirmAction({
      title: tr("Trocar para a branch {name}?", { name }),
      description: tr("Os arquivos da pasta passam a ser os da branch escolhida. Se houver alterações não commitadas, a troca é recusada para nada se perder."),
      detail: repo,
      confirmLabel: tr("Trocar"),
    });
    if (!ok) return;
    setBusy("branch");
    const out = await attempt(window.workspace.git.switchBranch({ projectPath: repo, name, confirmed: true }), tr("Branch trocada"));
    setBusy(null);
    if (out !== undefined) await refreshAll();
  }

  async function newBranch() {
    const name = await promptText({ title: tr("Nova branch"), label: tr("Nome (criada a partir da branch atual, com as suas alterações)"), placeholder: "feat/minha-funcao" });
    if (!name?.trim()) return;
    setBusy("branch");
    const out = await attempt(window.workspace.git.createBranch({ projectPath: repo, name: name.trim(), checkout: true }), tr("Branch criada"));
    setBusy(null);
    if (out !== undefined) await refreshAll();
  }

  const changeCount = changes?.length ?? git.modifiedCount;
  const allSelected = changes !== null && changes.length > 0 && selected.size === changes.length;
  const conflictCount = changes ? changes.filter((c) => c.conflict).length : git.conflicts;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Menu
          align="left"
          trigger={
            <span className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
              {busy === "branch" ? <Spinner className="h-3 w-3" /> : <GitBranch size={11} />} {git.branch ?? tr("(sem branch)")} <ChevronDown size={11} />
            </span>
          }
          items={[
            ...branches.map((b) => ({
              label: b.name,
              icon: b.current ? Check : GitBranch,
              disabled: b.current || busy !== null,
              onSelect: () => void switchTo(b.name),
            })),
            "separator" as const,
            { label: tr("Nova branch…"), icon: GitBranchPlus, onSelect: () => void newBranch() },
          ]}
        />
        {changeCount > 0 ? <Badge tone="warning">{trn(changeCount, "{n} alterado", "{n} alterados")}</Badge> : <Badge tone="success">{tr("Limpo")}</Badge>}
        {git.ahead > 0 && <Badge title={tr("Commits locais ainda não enviados")}>↑ {git.ahead}</Badge>}
        {git.behind > 0 && <Badge title={tr("Commits no remoto ainda não baixados")}>↓ {git.behind}</Badge>}
        {git.remoteUrl && !git.upstream && <Badge>{tr("Não publicada")}</Badge>}
        {git.upstream && git.ahead === 0 && git.behind === 0 && <Badge tone="success">{tr("Sincronizada")}</Badge>}
        <div className="ml-auto flex gap-1.5">
          <Button size="icon-sm" variant="ghost" onClick={() => void fetchRemote()} loading={busy === "fetch"} disabled={!git.remoteUrl || busy !== null} title={tr("Buscar no remoto (fetch)")}>
            <CloudDownload size={12} />
          </Button>
          <Button size="xs" variant="secondary" onClick={() => void remote("pull")} loading={busy === "pull"} disabled={!git.upstream || busy !== null}>
            <ArrowDownToLine size={12} /> {tr("Pull")}
          </Button>
          <Button size="xs" variant="secondary" onClick={() => void remote("push")} loading={busy === "push"} disabled={!git.remoteUrl || busy !== null}>
            <ArrowUpFromLine size={12} /> {tr("Push")}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => void refreshAll()} title={tr("Atualizar")}>
            <RefreshCw size={12} />
          </Button>
        </div>
      </div>

      {(git.operation || conflictCount > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-text">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {git.operation
                ? tr("{op} em andamento", { op: tr(OPERATION_LABEL[git.operation]) })
                : trn(conflictCount, "{n} arquivo com conflito", "{n} arquivos com conflito")}
            </p>
            <p className="mt-0.5 text-text-muted">
              {tr("Resolva os conflitos no VS Code ou no terminal e depois faça o commit. O Qyrex não resolve nem descarta conflitos sozinho.")}
            </p>
          </div>
          <Button size="xs" variant="secondary" onClick={() => void attempt(window.workspace.system.openVSCode(repo))}>
            <Code2 size={12} /> {tr("VS Code")}
          </Button>
        </div>
      )}

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {changes === null ? (
        <LoadingRows rows={2} />
      ) : changes.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <label className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-2.5 py-1.5 text-[11px] text-text-muted">
            <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(changes.map((c) => c.path)) : new Set())} />
            {tr("{n} de {total} marcados para o commit", { n: selected.size, total: changes.length })}
          </label>
          <div className="max-h-64 overflow-y-auto bg-bg">
            {changes.map((c) => (
              <div key={c.path}>
                <div className={cn("flex items-center gap-2 px-2.5 py-1 font-mono text-[11px]", openDiff === c.path && "bg-bg-hover")}>
                  <input type="checkbox" checked={selected.has(c.path)} onChange={() => toggleFile(c.path)} aria-label={tr("Incluir no commit")} />
                  <span className={cn("w-5 shrink-0", c.conflict ? "text-danger" : c.untracked ? "text-success" : "text-warning")}>{c.status}</span>
                  <button className="min-w-0 flex-1 truncate text-left text-text-muted hover:text-text" onClick={() => void toggleDiff(c.path)} title={tr("Ver diferenças")}>
                    {c.oldPath ? `${c.oldPath} → ${c.path}` : c.path}
                  </button>
                </div>
                {openDiff === c.path && (
                  <div className="border-y border-border-subtle">{diffLoading ? <LoadingRows rows={2} /> : diff && <DiffView diff={diff} />}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {changes && changes.length > 0 && (
        <div className="space-y-2">
          <textarea className="input min-h-[56px] resize-y" placeholder={tr("Mensagem do commit")} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void doCommit()} disabled={!message.trim() || selectedFiles.length === 0 || busy !== null} loading={busy === "commit"}>
              <GitCommitHorizontal size={13} /> {trn(selectedFiles.length, "Commitar {n} arquivo", "Commitar {n} arquivos")}
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="section-title mb-1.5">{tr("Commits recentes")}</p>
        {commits === null ? (
          <LoadingRows rows={2} />
        ) : commits.length === 0 ? (
          <p className="text-xs text-text-faint">{tr("Nenhum commit ainda.")}</p>
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
