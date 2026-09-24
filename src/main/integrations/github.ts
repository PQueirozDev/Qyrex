import { deleteSecret, getSecret, maskKey, saveSecret } from "../security/secrets.js";
import { setIntegrationState } from "../services/integrationsService.js";
import { createLogger } from "../logger.js";
import type { GitHubItem, GitHubOverview } from "../../shared/types.js";

const log = createLogger("github");

/**
 * Integração de leitura com a API REST do GitHub usando um Personal Access
 * Token (fine-grained, somente leitura é suficiente). Operações que alteram o
 * repositório (commit/pull/push) são feitas pelo git local, sempre com
 * confirmação — nunca pela API e nunca automaticamente.
 */
const API = "https://api.github.com";

function headers(token: string | null): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "PQueiroz-Workspace",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function gh<T>(path: string, token = getSecret("github")): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers(token) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 401) throw new Error("GitHub: token inválido ou expirado.");
    if (res.status === 404) throw new Error("GitHub: repositório não encontrado (ou sem acesso com este token).");
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      throw new Error("GitHub: limite de requisições atingido. Conecte um token para aumentar o limite.");
    }
    throw new Error(`GitHub (${res.status}): ${body.message ?? res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function connect(token: string): Promise<{ login: string }> {
  const user = await gh<{ login: string }>("/user", token.trim());
  saveSecret("github", token.trim());
  setIntegrationState("github", "connected", { login: user.login, maskedKey: maskKey(token.trim()), lastError: undefined });
  log.info("GitHub conectado");
  return user;
}

export function disconnect(): void {
  deleteSecret("github");
  setIntegrationState("github", "disconnected", {}, false);
}

export async function test(): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await gh<{ login: string }>("/user");
    setIntegrationState("github", "connected", { login: user.login, lastError: undefined });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setIntegrationState("github", "error", { lastError: message });
    return { ok: false, error: message };
  }
}

/** Extrai owner/repo de uma URL do GitHub, rejeitando qualquer outro host. */
export function parseRepo(url: string): { owner: string; repo: string } {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!match) throw new Error("URL do GitHub inválida (esperado https://github.com/usuario/repositorio).");
  return { owner: match[1], repo: match[2] };
}

interface RawItem {
  number: number;
  title: string;
  state: string;
  html_url: string;
  updated_at: string;
  user?: { login?: string };
  pull_request?: unknown;
}

const toItem = (i: RawItem): GitHubItem => ({
  number: i.number,
  title: i.title,
  state: i.state,
  author: i.user?.login ?? "",
  htmlUrl: i.html_url,
  updatedAt: i.updated_at,
});

export async function overview(repoUrl: string): Promise<GitHubOverview> {
  const { owner, repo } = parseRepo(repoUrl);
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [info, issues, pulls] = await Promise.all([
    gh<{
      full_name: string;
      description: string | null;
      default_branch: string;
      stargazers_count: number;
      open_issues_count: number;
      html_url: string;
      private: boolean;
    }>(base),
    gh<RawItem[]>(`${base}/issues?state=open&per_page=15&sort=updated`),
    gh<RawItem[]>(`${base}/pulls?state=open&per_page=10&sort=updated`),
  ]);
  return {
    repo: {
      fullName: info.full_name,
      description: info.description,
      defaultBranch: info.default_branch,
      stars: info.stargazers_count,
      openIssues: info.open_issues_count,
      htmlUrl: info.html_url,
      private: info.private,
    },
    // A API de issues também devolve PRs; separa as duas coisas.
    issues: issues.filter((i) => !i.pull_request).slice(0, 10).map(toItem),
    pulls: pulls.map(toItem),
  };
}
