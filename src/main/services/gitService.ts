import fs from "node:fs";
import path from "node:path";
import { runCapture } from "../security/exec.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { EXTERNAL_COMMANDS } from "../security/commands.js";
import type { GitBranch, GitChangedFile, GitCommit, GitDiff, GitOperation, GitStatusInfo } from "../../shared/types.js";
import { currentLanguage, tt } from "../i18n.js";
import { translatePlural } from "../../shared/i18n.js";

/**
 * Operações Git sempre via `git` com argumentos em array (sem shell).
 * Operações que alteram o repositório (commit/pull/push/trocar branch) exigem
 * que o handler IPC tenha recebido `confirmed: true` — a UI mostra o diálogo antes.
 * Nada aqui descarta alterações locais: trocar de branch é recusado com o
 * working tree sujo, pull é só fast-forward e push nunca é forçado.
 */

const GIT_ENV = {
  ...process.env,
  // Nunca travar esperando senha no terminal invisível.
  GIT_TERMINAL_PROMPT: "0",
  // Saída sempre em inglês/estável para o parse.
  LC_ALL: "C",
  // Caminhos vindos da UI são sempre literais: nada de curingas/"magic" (:(glob), *, ?).
  GIT_LITERAL_PATHSPECS: "1",
};

/** Diff maior que isso é cortado (a UI avisa e sugere o VS Code). */
const MAX_DIFF_BYTES = 400_000;
/** Arquivo novo (não rastreado) maior que isso não é mostrado como diff. */
const MAX_UNTRACKED_PREVIEW = 200_000;

async function git(cwd: string, args: string[], timeoutMs = 20_000, maxOutputBytes?: number) {
  // core.quotepath=false: nomes com acento saem como texto, não como \303\247.
  const res = await runCapture(EXTERNAL_COMMANDS.git, ["-c", "core.quotepath=false", ...args], { cwd, env: GIT_ENV, timeoutMs, maxOutputBytes });
  if (res.timedOut) throw new Error(`git ${args[0]} excedeu o tempo limite.`);
  return res;
}

async function gitOk(cwd: string, args: string[], timeoutMs?: number): Promise<string> {
  const res = await git(cwd, args, timeoutMs);
  if (res.code !== 0) {
    throw new Error((res.stderr || res.stdout).trim() || tt("git {cmd} falhou (código {code}).", { cmd: args[0], code: String(res.code) }));
  }
  return res.stdout;
}

export function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

function assertRepo(projectPath: string): string {
  const resolved = assertPathAllowedAndExists(projectPath);
  if (!isGitRepo(resolved)) throw new Error("Esta pasta não é um repositório Git.");
  return resolved;
}

/** Converte remotes SSH/HTTPS do GitHub em URL https navegável. */
export function remoteToGithubUrl(remote: string): string | null {
  const trimmed = remote.trim();
  const ssh = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(\.git)?$/.exec(trimmed);
  if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`;
  const https = /^https:\/\/(?:[^@/]+@)?github\.com\/([\w.-]+)\/([\w.-]+?)(\.git)?\/?$/.exec(trimmed);
  if (https) return `https://github.com/${https[1]}/${https[2]}`;
  return null;
}

/** Códigos XY do porcelain que indicam conflito de merge não resolvido. */
const CONFLICT_CODES = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

/**
 * Lê `git status --porcelain=v1 -z`. Com `-z` os caminhos vêm crus (sem aspas
 * nem escapes), então nomes com espaço, acento ou aspas funcionam.
 * Renomeações trazem o caminho antigo no campo seguinte.
 */
export function parsePorcelainZ(raw: string): { header: string; files: GitChangedFile[] } {
  const fields = raw.split("\0");
  let header = "";
  const files: GitChangedFile[] = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (!entry) continue;
    if (entry.startsWith("## ")) {
      header = entry;
      continue;
    }
    const xy = entry.slice(0, 2);
    const file: GitChangedFile = {
      status: xy.trim() || "?",
      path: entry.slice(3),
      oldPath: null,
      staged: xy[0] !== " " && xy[0] !== "?",
      untracked: xy === "??",
      conflict: CONFLICT_CODES.has(xy),
    };
    if (xy[0] === "R" || xy[0] === "C") file.oldPath = fields[++i] ?? null;
    files.push(file);
  }
  return { header, files };
}

/** "## main...origin/main [ahead 1, behind 2]" ou "## No commits yet on main". */
export function parseBranchHeader(header: string): { branch: string | null; upstream: string | null; ahead: number; behind: number } {
  const body = header.replace(/^## /, "");
  const noCommits = /^(?:No commits yet on |Initial commit on )(.+)$/.exec(body);
  if (noCommits) return { branch: noCommits[1], upstream: null, ahead: 0, behind: 0 };
  // HEAD solto (checkout de um commit): não há branch.
  if (body.startsWith("HEAD (no branch)")) return { branch: null, upstream: null, ahead: 0, behind: 0 };
  const m = /^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/.exec(body);
  return {
    branch: m?.[1] ?? null,
    upstream: m?.[2] ?? null,
    ahead: Number(/ahead (\d+)/.exec(m?.[3] ?? "")?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(m?.[3] ?? "")?.[1] ?? 0),
  };
}

/** Merge/rebase/cherry-pick parado no meio (normalmente por conflito). */
function operationInProgress(repo: string): GitOperation | null {
  const gitDir = path.join(repo, ".git");
  // Em worktrees/submódulos .git é um arquivo: sem como checar barato, não informa.
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return null;
  if (fs.existsSync(path.join(gitDir, "rebase-merge")) || fs.existsSync(path.join(gitDir, "rebase-apply"))) return "rebase";
  if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) return "merge";
  if (fs.existsSync(path.join(gitDir, "CHERRY_PICK_HEAD"))) return "cherry-pick";
  return null;
}

export async function getGitStatus(projectPath: string): Promise<GitStatusInfo> {
  const resolved = assertPathAllowedAndExists(projectPath);
  const empty: GitStatusInfo = {
    branch: null,
    modifiedCount: 0,
    isRepo: false,
    ahead: 0,
    behind: 0,
    remoteUrl: null,
    upstream: null,
    conflicts: 0,
    operation: null,
  };
  if (!isGitRepo(resolved)) return empty;

  const [status, remote] = await Promise.all([
    git(resolved, ["status", "--porcelain=v1", "--branch", "-z"]),
    git(resolved, ["remote", "get-url", "origin"]),
  ]);
  if (status.code !== 0) return { ...empty, isRepo: true };

  const { header, files } = parsePorcelainZ(status.stdout);
  const branch = parseBranchHeader(header);
  return {
    branch: branch.branch,
    modifiedCount: files.length,
    isRepo: true,
    ahead: branch.ahead,
    behind: branch.behind,
    remoteUrl: remote.code === 0 ? remoteToGithubUrl(remote.stdout) : null,
    upstream: branch.upstream,
    conflicts: files.filter((f) => f.conflict).length,
    operation: operationInProgress(resolved),
  };
}

export async function getRemoteGithubUrl(dir: string): Promise<string | null> {
  if (!isGitRepo(dir)) return null;
  const res = await git(dir, ["remote", "get-url", "origin"]).catch(() => null);
  return res && res.code === 0 ? remoteToGithubUrl(res.stdout) : null;
}

export async function getRecentCommits(projectPath: string, limit = 10): Promise<GitCommit[]> {
  const resolved = assertPathAllowedAndExists(projectPath);
  if (!isGitRepo(resolved)) return [];
  const SEP = "\x1f";
  const res = await git(resolved, ["log", `-n${Math.min(Math.max(limit, 1), 50)}`, `--pretty=format:%H${SEP}%h${SEP}%an${SEP}%aI${SEP}%s`]);
  if (res.code !== 0) return []; // repositório sem commits ainda
  return res.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, author, date, subject] = line.split(SEP);
      return { hash, shortHash, author, date, subject };
    });
}

export async function getChangedFiles(projectPath: string): Promise<GitChangedFile[]> {
  const resolved = assertPathAllowedAndExists(projectPath);
  if (!isGitRepo(resolved)) return [];
  return parsePorcelainZ(await gitOk(resolved, ["status", "--porcelain=v1", "-z"])).files;
}

/**
 * Caminho relativo vindo do renderer: precisa cair dentro do repositório.
 * Vai sempre depois de `--` (nunca é lido como opção do git).
 */
function assertInsideRepo(repo: string, file: string): string {
  if (path.isAbsolute(file)) throw new Error("Caminho inválido.");
  const full = path.resolve(repo, file);
  const rel = path.relative(repo, full);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Caminho inválido.");
  return rel.split(path.sep).join("/");
}

/** Diff de um arquivo em relação ao último commit (staged + não staged). */
export async function getFileDiff(projectPath: string, file: string): Promise<GitDiff> {
  const repo = assertRepo(projectPath);
  const rel = assertInsideRepo(repo, file);
  const changed = (await getChangedFiles(repo)).find((f) => f.path === rel || f.path === `${rel}/`);

  if (changed?.untracked) {
    // Arquivo novo: mostra o conteúdo como "tudo adicionado", sem passar pelo git.
    // Um arquivo novo pode ser um symlink para fora da pasta: o caminho real passa pela allowlist.
    const full = assertPathAllowedAndExists(path.join(repo, rel));
    const stat = fs.statSync(full);
    if (stat.isDirectory()) return { file: rel, diff: "", truncated: false, binary: false, untracked: true };
    if (stat.size > MAX_UNTRACKED_PREVIEW) return { file: rel, diff: "", truncated: true, binary: false, untracked: true };
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) return { file: rel, diff: "", truncated: false, binary: true, untracked: true };
    const lines = buf.toString("utf8").split(/\r?\n/);
    if (lines[lines.length - 1] === "") lines.pop();
    return { file: rel, diff: [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join("\n"), truncated: false, binary: false, untracked: true };
  }

  // --no-ext-diff e --no-textconv: ver um diff nunca roda programas configurados no repositório.
  const base = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M"];
  let res = await git(repo, [...base, "HEAD", "--", rel], 20_000, MAX_DIFF_BYTES + 1);
  if (res.code !== 0) {
    // Repositório sem nenhum commit: compara com o que já está no stage.
    res = await git(repo, [...base, "--cached", "--", rel], 20_000, MAX_DIFF_BYTES + 1);
    if (res.code !== 0) throw new Error((res.stderr || res.stdout).trim() || "git diff falhou.");
  }
  const binary = /^Binary files .* differ$/m.test(res.stdout);
  const truncated = res.stdout.length > MAX_DIFF_BYTES;
  return { file: rel, diff: binary ? "" : res.stdout.slice(0, MAX_DIFF_BYTES), truncated, binary, untracked: false };
}

/**
 * Commit. Com `files`, só esses caminhos entram (mesmo que haja outras coisas
 * no stage); sem `files`, `stageAll` decide entre `git add --all` e o stage atual.
 */
export async function commit(projectPath: string, message: string, stageAll: boolean, files?: string[]): Promise<string> {
  const resolved = assertRepo(projectPath);
  if (files && files.length > 0) {
    const rels = files.map((f) => assertInsideRepo(resolved, f));
    // O nome antigo de uma renomeação já no stage não existe mais nem no índice nem na pasta:
    // não dá para "adicionar", mas precisa ir no commit para a renomeação sair completa.
    const goneRenames = new Set((await getChangedFiles(resolved)).filter((f) => f.staged && f.oldPath).map((f) => f.oldPath!));
    const toAdd = rels.filter((r) => !goneRenames.has(r));
    if (toAdd.length > 0) await gitOk(resolved, ["add", "--all", "--", ...toAdd]);
    // A mensagem vai como argumento isolado: nenhuma interpretação por shell.
    return (await gitOk(resolved, ["commit", "-m", message, "--", ...rels])).trim();
  }
  if (stageAll) await gitOk(resolved, ["add", "--all"]);
  return (await gitOk(resolved, ["commit", "-m", message])).trim();
}

export async function pull(projectPath: string): Promise<string> {
  const resolved = assertRepo(projectPath);
  // --ff-only: nunca cria merge commits nem reescreve histórico silenciosamente.
  const res = await git(resolved, ["pull", "--ff-only"], 120_000);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout).trim() || "git pull falhou.");
  return (res.stdout + res.stderr).trim();
}

export async function push(projectPath: string): Promise<string> {
  const resolved = assertRepo(projectPath);
  // Sem --force, nunca. Push forçado não é oferecido pelo Workspace.
  // Branch nova ainda sem upstream: publica em origin com o mesmo nome (-u), também sem forçar.
  const status = await getGitStatus(resolved);
  const args = status.upstream || !status.branch ? ["push"] : ["push", "-u", "origin", status.branch];
  const res = await git(resolved, args, 120_000);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout).trim() || "git push falhou.");
  return (res.stdout + res.stderr).trim();
}

/** Atualiza as referências remotas (ahead/behind) sem mexer nos arquivos. */
export async function fetchRemote(projectPath: string): Promise<GitStatusInfo> {
  const resolved = assertRepo(projectPath);
  const res = await git(resolved, ["fetch", "--prune"], 120_000);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout).trim() || "git fetch falhou.");
  return getGitStatus(resolved);
}

export async function listBranches(projectPath: string): Promise<GitBranch[]> {
  const resolved = assertRepo(projectPath);
  const SEP = "\x1f";
  const res = await git(resolved, ["branch", `--format=%(refname:short)${SEP}%(HEAD)${SEP}%(upstream:short)${SEP}%(committerdate:iso-strict)`]);
  if (res.code !== 0) return [];
  return res.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, head, upstream, date] = line.split(SEP);
      return { name, current: head === "*", upstream: upstream || null, lastCommitAt: date || null };
    })
    .filter((b) => !b.name.startsWith("("));
}

/** Nome de branch válido para o git (sem espaços, `..`, `~`, `^`, `:` etc.). */
async function assertBranchName(repo: string, name: string): Promise<void> {
  if (name.startsWith("-")) throw new Error("Nome de branch inválido.");
  const res = await git(repo, ["check-ref-format", "--branch", name]);
  if (res.code !== 0) throw new Error("Nome de branch inválido.");
}

/** Trocar com alterações não commitadas poderia levar ou perder trabalho: é recusado. */
async function assertCleanForSwitch(repo: string): Promise<void> {
  const dirty = (await getChangedFiles(repo)).filter((f) => !f.untracked);
  if (dirty.length > 0) {
    throw new Error(
      translatePlural(
        currentLanguage(),
        dirty.length,
        "Há {n} arquivo com alterações não commitadas. Faça commit antes de trocar de branch.",
        "Há {n} arquivos com alterações não commitadas. Faça commit antes de trocar de branch."
      )
    );
  }
}

export async function switchBranch(projectPath: string, name: string): Promise<string> {
  const repo = assertRepo(projectPath);
  await assertBranchName(repo, name);
  if (!(await listBranches(repo)).some((b) => b.name === name)) throw new Error("Branch não encontrada.");
  await assertCleanForSwitch(repo);
  // Sem --force/--discard-changes: se algo não rastreado fosse sobrescrito, o próprio git recusa.
  const res = await git(repo, ["switch", name]);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout).trim() || "git switch falhou.");
  return (res.stdout + res.stderr).trim();
}

/** Cria a branch a partir da atual. `checkout` também troca para ela (as alterações locais vão junto, nada se perde). */
export async function createBranch(projectPath: string, name: string, checkout: boolean): Promise<string> {
  const repo = assertRepo(projectPath);
  await assertBranchName(repo, name);
  if ((await listBranches(repo)).some((b) => b.name === name)) throw new Error("Já existe uma branch com esse nome.");
  const res = await git(repo, checkout ? ["switch", "-c", name] : ["branch", name]);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout).trim() || "Não foi possível criar a branch.");
  return (res.stdout + res.stderr).trim();
}
