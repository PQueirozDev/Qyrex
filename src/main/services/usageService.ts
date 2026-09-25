import { randomUUID } from "node:crypto";
import { getDb } from "../database/db.js";
import type { AIProviderId, AIUsageRecord, AIUsageSource, AIUsageSummary, AIUsageTotals } from "../../shared/types.js";

/**
 * Histórico local de uso da IA: só contadores de tokens (nunca o conteúdo das
 * mensagens) e o custo estimado, calculado na leitura a partir da tabela de preços.
 */

export interface UsageCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Preços em US$ por milhão de tokens (entrada, saída). Fonte: tabela oficial de
 * preços da API da Anthropic. Leitura de cache custa ~0,1× a entrada e escrita
 * de cache ~1,25×. Modelos fora da tabela (OpenAI, Gemini, outros) ficam sem
 * custo estimado — o app mostra só os tokens, sem inventar preço.
 */
const PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /^claude-fable-5(-1)?\b/, input: 10, output: 50 },
  { match: /^claude-mythos-5(-1)?\b/, input: 10, output: 50 },
  { match: /^claude-opus-5-5\b/, input: 4, output: 20 },
  { match: /^claude-opus-5\b/, input: 5, output: 25 },
  { match: /^claude-opus-4-[678]\b/, input: 5, output: 25 },
  { match: /^claude-sonnet-5\b/, input: 2, output: 10 },
  { match: /^claude-sonnet-4-6\b/, input: 3, output: 15 },
  { match: /^claude-haiku-4-5\b/, input: 1, output: 5 },
];

export function priceFor(provider: AIProviderId, model: string): { input: number; output: number } | null {
  if (provider !== "anthropic") return null;
  // A lista está em ordem do mais específico para o mais geral (ex.: opus-5-5 antes de opus-5).
  const entry = PRICES.find((p) => p.match.test(model));
  return entry ? { input: entry.input, output: entry.output } : null;
}

export function estimateCost(provider: AIProviderId, model: string, u: UsageCounts): number | null {
  const price = priceFor(provider, model);
  if (!price) return null;
  const perToken = (usd: number) => usd / 1_000_000;
  return (
    u.inputTokens * perToken(price.input) +
    u.cacheReadTokens * perToken(price.input * 0.1) +
    u.cacheWriteTokens * perToken(price.input * 1.25) +
    u.outputTokens * perToken(price.output)
  );
}

/** Estimativa grosseira (~4 caracteres por token) quando o provider não informa o uso. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function recordUsage(input: {
  provider: AIProviderId;
  model: string;
  source: AIUsageSource;
  conversationId?: string | null;
  usage: UsageCounts;
  estimated: boolean;
  aborted: boolean;
}): void {
  const u = input.usage;
  if (u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens === 0) return;
  getDb()
    .prepare(
      `INSERT INTO ai_usage (id, provider, model, source, conversation_id, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, estimated, aborted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      input.provider,
      input.model,
      input.source,
      input.conversationId ?? null,
      Math.max(0, Math.round(u.inputTokens)),
      Math.max(0, Math.round(u.outputTokens)),
      Math.max(0, Math.round(u.cacheReadTokens)),
      Math.max(0, Math.round(u.cacheWriteTokens)),
      input.estimated ? 1 : 0,
      input.aborted ? 1 : 0
    );
}

interface UsageRow {
  id: string;
  created_at: string;
  provider: string;
  model: string;
  source: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  estimated: number;
  aborted: number;
}

function toRecord(r: UsageRow): AIUsageRecord {
  const usage = {
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    cacheWriteTokens: r.cache_write_tokens,
  };
  return {
    id: r.id,
    createdAt: r.created_at,
    provider: r.provider as AIProviderId,
    model: r.model,
    source: r.source as AIUsageSource,
    ...usage,
    estimated: Boolean(r.estimated),
    aborted: Boolean(r.aborted),
    costUsd: estimateCost(r.provider as AIProviderId, r.model, usage),
  };
}

function emptyTotals(): AIUsageTotals {
  return { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, unpricedRequests: 0 };
}

function add(t: AIUsageTotals, r: AIUsageRecord): void {
  t.requests += 1;
  t.inputTokens += r.inputTokens;
  t.outputTokens += r.outputTokens;
  t.cacheReadTokens += r.cacheReadTokens;
  t.cacheWriteTokens += r.cacheWriteTokens;
  if (r.costUsd === null) t.unpricedRequests += 1;
  else t.costUsd += r.costUsd;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Dia LOCAL (AAAA-MM-DD) de um timestamp UTC. */
function localDay(isoUtc: string): string {
  const d = new Date(isoUtc);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Resumo do uso. `days` = últimos N dias (incluindo hoje, no horário local);
 * null = todo o histórico. `now` existe para os testes.
 */
export function getUsageSummary(days: number | null, now = new Date()): AIUsageSummary {
  let since: string | null = null;
  if (days !== null) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    since = start.toISOString();
  }
  const rows = (
    since
      ? getDb().prepare("SELECT * FROM ai_usage WHERE created_at >= ? ORDER BY created_at DESC").all(since)
      : getDb().prepare("SELECT * FROM ai_usage ORDER BY created_at DESC").all()
  ) as UsageRow[];
  const records = rows.map(toRecord);

  const totals = emptyTotals();
  const byModel = new Map<string, AIUsageTotals & { provider: AIProviderId; model: string }>();
  const byDay = new Map<string, AIUsageSummary["byDay"][number]>();

  for (const r of records) {
    add(totals, r);
    const key = `${r.provider}\u0000${r.model}`;
    if (!byModel.has(key)) byModel.set(key, { ...emptyTotals(), provider: r.provider, model: r.model });
    add(byModel.get(key)!, r);

    const day = localDay(r.createdAt);
    if (!byDay.has(day)) byDay.set(day, { date: day, inputTokens: 0, outputTokens: 0, costUsd: 0, byProvider: {} });
    const d = byDay.get(day)!;
    d.inputTokens += r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    d.outputTokens += r.outputTokens;
    d.costUsd += r.costUsd ?? 0;
    const tokens = r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens + r.outputTokens;
    d.byProvider[r.provider] = (d.byProvider[r.provider] ?? 0) + tokens;
  }

  // Série diária contínua (dias sem uso aparecem zerados) para períodos definidos.
  let series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (days !== null) {
    series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      series.push(byDay.get(key) ?? { date: key, inputTokens: 0, outputTokens: 0, costUsd: 0, byProvider: {} });
    }
  }

  return {
    days,
    totals,
    byModel: [...byModel.values()].sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)),
    byDay: series,
    recent: records.slice(0, 25),
  };
}

export function clearUsage(): void {
  getDb().prepare("DELETE FROM ai_usage").run();
}
