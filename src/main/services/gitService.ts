import fs from "node:fs";
import path from "node:path";
import { runCapture } from "../security/exec.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { EXTERNAL_COMMANDS } from "../security/commands.js";
import type { GitChangedFile, GitCommit, GitStatusInfo } from "../../shared/types.js";

/**
 * Operações Git sempre via `git` com argumentos em array (sem shell).
 * Operações que alteram o repositório (commit/pull/push) exigem que o handler
 * IPC tenha recebido `confirmed: true` — a UI mostra o diálogo antes.
 */

const GIT_ENV = {
  ...process.env,
  // Nunca travar esperando senha no terminal invisível.
  GIT_TERMINAL_PROMPT: "0",
  // Saída sempre em inglês/estável para o parse.
  LC_ALL: "C",
};

async function git(cwd: string, args: string[], timeoutMs = 20_000) {
  const res = await runCapture(EXTERNAL_COMMANDS.git, args, { cwd, env: GIT_ENV, timeoutMs });
  if (res.timedOut) throw new Error(`git ${args[0]} excedeu o tempo limite.`);
  return res;
}

async function gitOk(cwd: string, args: string[], timeoutMs?: number): Promise<string> {
  const res = await git(cwd, args, timeoutMs);
  if (res.code !== 0) {
    throw new Error((res.stderr || res.stdout).trim() || `git ${args[0]} falhou (código ${res.code}).`);
  }
  return res.stdout;
}

export function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
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

export async function getGitStatus(projectPath: string): Promise<GitStatusInfo> {
  const resolved = assertPathAllowedAndExists(projectPath);
  const empty: GitStatusInfo = { branch: null, modifiedCount: 0, isRepo: false, ahead: 0, behind: 0, remoteUrl: null };
  if (!isGitRepo(resolved)) return empty;

  const [status, remote] = await Promise.all([
    git(resolved, ["status", "--porcelain=v1", "--branch"]),
    git(resolved, ["remote", "get-url", "origin"]),
  ]);
  if (status.code !== 0) return { ...empty, isRepo: true };

  const lines = status.stdout.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0]?.startsWith("## ") ? lines.shift()! : "";
  // "## main...origin/main [ahead 1, behind 2]" ou "## No commits yet on main"
  const branchMatch = /^## (?:No commits yet on |Initial commit on )?(.+?)(?:\.\.\.|\s|$)/.exec(header);
  const ahead = Number(/ahead (\d+)/.exec(header)?.[1] ?? 0);
  const behind = Number(/behind (\d+)/.exec(header)?.[1] ?? 0);

  return {
    branch: branchMatch?.[1] ?? null,
    modifiedCount: lines.length,
    isRepo: true,
    ahead,
    behind,
    remoteUrl: remote.code === 0 ? remoteToGithubUrl(remote.stdout) : null,
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
  const out = await gitOk(resolved, ["status", "--porcelain=v1"]);
  return out
    .split(/\r?\n/)
    .filter((l) => l.length > 3)
    .map((l) => ({ status: l.slice(0, 2).trim() || "?", path: l.slice(3) }));
}

export async function commit(projectPath: string, message: string, stageAll: boolean): Promise<string> {
  const resolved = assertPathAllowedAndExists(projectPath);
  if (!isGitRepo(resolved)) throw new Error("Esta pasta não é um repositório Git.");
  if (stageAll) await gitOk(resolved, ["add", "--all"]);
  // A mensagem vai como argumento isolado: nenhuma interpretação por shell.
  return (await gitOk(resolved, ["commit", "-m", message])).trim();
}

export async function pull(projectPath: string): Promise<string> {
  const resolved = assertPathAllowedAndExists(projectPath);
  if (!isGitRepo(resolved)) throw new Error("Esta pasta não é um repositório Git.");
  // --ff-only: nunca cria merge commits nem reescreve histórico silenciosamente.
  const res = await git(resolved, ["pull", "--ff-only"], 120_000);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout).trim() || "git pull falhou.");
  return (res.stdout + res.stderr).trim();
}

export async function push(projectPath: string): Promise<string> {
  const resolved = assertPathAllowedAndExists(projectPath);
  if (!isGitRepo(resolved)) throw new Error("Esta pasta não é um repositório Git.");
  // Sem --force, nunca. Push forçado não é oferecido pelo Workspace.
  const res = await git(resolved, ["push"], 120_000);
  if (res.code !== 0) throw new Error((res.stderr || res.stdout).trim() || "git push falhou.");
  return (res.stdout + res.stderr).trim();
}
