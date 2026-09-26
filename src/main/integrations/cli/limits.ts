import { runCapture, runDialogue } from "../../security/exec.js";
import { createLogger } from "../../logger.js";
import { tt } from "../../i18n.js";
import type { SubscriptionLimits, SubscriptionLimitWindow } from "../../../shared/types.js";
import { childEnv, cliStatus, find, scratchDir, type SubscriptionCli } from "./subscriptions.js";

/**
 * Quanto da assinatura já foi usado (limites de 5h e da semana), lido das
 * próprias CLIs oficiais, sem tocar no login:
 *   - Claude Code: o comando `/usage` em modo não interativo (não gasta uso);
 *   - Codex: `account/rateLimits/read` do `codex app-server` (JSON-RPC por stdio).
 * Nenhuma das duas chamadas envia conteúdo a um modelo.
 */

const log = createLogger("limits");

const PROVIDER: Record<SubscriptionCli, "anthropic" | "openai"> = { claude: "anthropic", codex: "openai" };
const TTL_MS = 60_000;
const MIN_FORCE_MS = 5_000;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * "Sep 26, 4:19am", "4:19am", "Sep 26" ou "Sep 26 at 4pm" → Date no fuso local.
 * O Claude Code escreve o horário no fuso do próprio PC, o mesmo do app.
 */
export function parseResetText(text: string, now = new Date()): Date | null {
  const m = /^\s*(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*|\s+at\s+|\s+)?)?(?:(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i.exec(text);
  if (!m || (!m[1] && !m[3])) return null;
  const month = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (m[1] && month < 0) return null;
  let hours = m[3] ? Number(m[3]) % 12 : 0;
  if (m[5]?.toLowerCase() === "pm") hours += 12;
  const minutes = m[4] ? Number(m[4]) : 0;
  const date = new Date(now);
  date.setSeconds(0, 0);
  if (month >= 0) date.setMonth(month, Number(m[2]));
  date.setHours(hours, minutes);
  if (month < 0 && date.getTime() < now.getTime() - 60_000) date.setDate(date.getDate() + 1);
  if (month >= 0 && date.getTime() < now.getTime() - 86_400_000) date.setFullYear(date.getFullYear() + 1);
  return date;
}

/** Linhas "Current session: 31% used · resets Sep 26, 4:19am (America/Sao_Paulo)" do `/usage`. */
export function parseClaudeUsage(text: string, now = new Date()): SubscriptionLimitWindow[] {
  const windows: SubscriptionLimitWindow[] = [];
  const re = /^\s*Current (session|week)(?:\s*\(([^)]+)\))?:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*[·•-]\s*resets\s+(.+?))?\s*$/gim;
  for (const m of text.matchAll(re)) {
    const scope = m[2]?.trim() ?? "";
    const allModels = !scope || /all models/i.test(scope);
    const resetsAt = m[4] ? parseResetText(m[4].replace(/\([^)]*\)\s*$/, ""), now) : null;
    windows.push({
      kind: m[1].toLowerCase() === "session" ? "session" : allModels ? "week" : "model",
      label: m[1].toLowerCase() === "week" && !allModels ? scope.replace(/\s*only$/i, "") : null,
      usedPercent: Math.max(0, Math.min(100, Number(m[3]))),
      resetsAt: resetsAt ? resetsAt.toISOString() : null,
    });
  }
  return windows;
}

interface CodexWindow {
  usedPercent?: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
}
interface CodexSnapshot {
  limitId?: string | null;
  limitName?: string | null;
  primary?: CodexWindow | null;
  secondary?: CodexWindow | null;
  planType?: string | null;
  rateLimitReachedType?: string | null;
}
export interface CodexRateLimitsResponse {
  ordinaryUsageAllowed?: boolean | null;
  rateLimits?: CodexSnapshot;
  rateLimitsByLimitId?: Record<string, CodexSnapshot | undefined> | null;
  rateLimitResetCredits?: { availableCount?: number } | null;
}

function codexWindow(w: CodexWindow | null | undefined, fallback: "session" | "week"): SubscriptionLimitWindow | null {
  if (!w || typeof w.usedPercent !== "number") return null;
  const mins = w.windowDurationMins ?? null;
  return {
    kind: mins === null ? fallback : mins <= 24 * 60 ? "session" : "week",
    label: null,
    usedPercent: Math.max(0, Math.min(100, w.usedPercent)),
    resetsAt: typeof w.resetsAt === "number" ? new Date(w.resetsAt * 1000).toISOString() : null,
  };
}

export function parseCodexLimits(res: CodexRateLimitsResponse): Pick<SubscriptionLimits, "windows" | "plan" | "resetCredits" | "limited"> {
  const main = res.rateLimits ?? {};
  const windows = [codexWindow(main.primary, "session"), codexWindow(main.secondary, "week")].filter((w): w is SubscriptionLimitWindow => w !== null);
  // Outros "baldes" (limites próprios de um modelo) entram como janela do modelo.
  for (const [id, snap] of Object.entries(res.rateLimitsByLimitId ?? {})) {
    if (!snap || id === (main.limitId ?? "codex")) continue;
    const w = codexWindow(snap.secondary ?? snap.primary, "week");
    if (w) windows.push({ ...w, kind: "model", label: snap.limitName ?? id });
  }
  return {
    windows,
    plan: main.planType ?? null,
    resetCredits: res.rateLimitResetCredits?.availableCount ?? null,
    limited: res.ordinaryUsageAllowed === false || Boolean(main.rateLimitReachedType),
  };
}

async function claudeLimits(exe: string): Promise<Pick<SubscriptionLimits, "windows" | "error">> {
  const res = await runCapture(
    exe,
    ["-p", "/usage", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"],
    { timeoutMs: 45_000, env: childEnv(), cwd: scratchDir(), maxOutputBytes: 200_000 }
  );
  let text = res.stdout;
  try {
    text = (JSON.parse(res.stdout.trim()) as { result?: string }).result ?? res.stdout;
  } catch {
    // saída em texto puro
  }
  const windows = parseClaudeUsage(text);
  return { windows, error: windows.length ? null : res.timedOut ? tt("Tempo esgotado.") : tt("O Claude Code não informou o uso.") };
}

async function codexLimits(exe: string): Promise<CodexRateLimitsResponse> {
  return runDialogue<CodexRateLimitsResponse>(exe, ["app-server"], {
    cwd: scratchDir(),
    env: childEnv(),
    timeoutMs: 30_000,
    start: (write) => write(JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "qrzspace", title: "QrzSpace", version: "1" } } })),
    onLine: (line, write) => {
      let msg: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(line) as typeof msg;
      } catch {
        return undefined;
      }
      if (msg.id === 1) {
        write(JSON.stringify({ method: "initialized" }));
        write(JSON.stringify({ id: 2, method: "account/rateLimits/read" }));
      }
      if (msg.id === 2) {
        if (msg.error) throw new Error(msg.error.message ?? "erro");
        return (msg.result ?? {}) as CodexRateLimitsResponse;
      }
      return undefined;
    },
  });
}

async function readLimits(cli: SubscriptionCli): Promise<SubscriptionLimits> {
  const base: SubscriptionLimits = {
    provider: PROVIDER[cli],
    cli,
    available: false,
    plan: null,
    windows: [],
    resetCredits: null,
    limited: false,
    error: null,
    fetchedAt: new Date().toISOString(),
  };
  const exe = find(cli);
  if (!exe) return base;
  try {
    if (cli === "claude") {
      const st = await cliStatus("claude");
      if (!st.loggedIn) return base;
      const plan = /\(([^)]+)\)\s*$/.exec(st.account ?? "")?.[1] ?? null;
      return { ...base, available: true, plan, ...(await claudeLimits(exe)) };
    }
    return { ...base, available: true, ...parseCodexLimits(await codexLimits(exe)) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`limites da assinatura (${cli}) indisponíveis: ${message}`);
    // Codex deslogado: o app-server responde com erro de autenticação.
    if (cli === "codex" && /auth|login|logged/i.test(message)) return base;
    return { ...base, available: true, error: message.slice(0, 300) };
  }
}

const cache = new Map<SubscriptionCli, { at: number; value: Promise<SubscriptionLimits> }>();

function cached(cli: SubscriptionCli, force: boolean): Promise<SubscriptionLimits> {
  const hit = cache.get(cli);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < (force ? MIN_FORCE_MS : TTL_MS)) return hit.value;
  const value = readLimits(cli);
  cache.set(cli, { at: Date.now(), value });
  value.catch(() => cache.delete(cli));
  return value;
}

export async function getSubscriptionLimits(force = false, only?: SubscriptionCli): Promise<SubscriptionLimits[]> {
  const clis: SubscriptionCli[] = only ? [only] : ["claude", "codex"];
  return Promise.all(clis.map((cli) => cached(cli, force)));
}
