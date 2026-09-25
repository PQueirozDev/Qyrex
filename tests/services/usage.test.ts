import { beforeEach, describe, expect, it } from "vitest";
import { clearUsage, estimateCost, estimateTokens, getUsageSummary, priceFor, recordUsage } from "../../src/main/services/usageService";
import { parseOpenAIUsage } from "../../src/main/integrations/providers/openai";
import { parseGeminiUsage } from "../../src/main/integrations/providers/google";
import { getDb } from "../../src/main/database/db";
import { freshDb } from "../helpers";

const zero = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe("preços e custo estimado", () => {
  it("conhece os modelos Claude da tabela oficial", () => {
    expect(priceFor("anthropic", "claude-opus-5")).toEqual({ input: 5, output: 25 });
    expect(priceFor("anthropic", "claude-opus-5-5")).toEqual({ input: 4, output: 20 });
    expect(priceFor("anthropic", "claude-sonnet-5")).toEqual({ input: 2, output: 10 });
    expect(priceFor("anthropic", "claude-haiku-4-5")).toEqual({ input: 1, output: 5 });
    expect(priceFor("anthropic", "claude-fable-5-1")).toEqual({ input: 10, output: 50 });
  });

  it("não inventa preço para modelos desconhecidos ou de outros providers", () => {
    expect(priceFor("anthropic", "claude-modelo-futuro")).toBeNull();
    expect(priceFor("openai", "gpt-5")).toBeNull();
    expect(estimateCost("google", "gemini-2.5-pro", { ...zero, inputTokens: 1000 })).toBeNull();
  });

  it("calcula entrada, saída e cache", () => {
    // Opus 5: 1M entrada = US$5, 1M saída = US$25, cache: leitura 0,1× e escrita 1,25× da entrada.
    expect(estimateCost("anthropic", "claude-opus-5", { ...zero, inputTokens: 1_000_000 })).toBeCloseTo(5);
    expect(estimateCost("anthropic", "claude-opus-5", { ...zero, outputTokens: 1_000_000 })).toBeCloseTo(25);
    expect(estimateCost("anthropic", "claude-opus-5", { ...zero, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.5);
    expect(estimateCost("anthropic", "claude-opus-5", { ...zero, cacheWriteTokens: 1_000_000 })).toBeCloseTo(6.25);
  });

  it("estima ~4 caracteres por token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("parsers de uso dos providers", () => {
  it("OpenAI: separa tokens em cache do prompt", () => {
    expect(parseOpenAIUsage({ prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 300 } })).toEqual({
      inputTokens: 700,
      outputTokens: 200,
      cacheReadTokens: 300,
      cacheWriteTokens: 0,
    });
  });

  it("Gemini: pensamento conta como saída e cache sai da entrada", () => {
    expect(parseGeminiUsage({ promptTokenCount: 500, candidatesTokenCount: 120, thoughtsTokenCount: 80, cachedContentTokenCount: 100 })).toEqual({
      inputTokens: 400,
      outputTokens: 200,
      cacheReadTokens: 100,
      cacheWriteTokens: 0,
    });
  });
});

describe("histórico de uso", () => {
  beforeEach(() => freshDb());

  // Ajusta a data da requisição recém-gravada (a última inserida).
  const setCreated = (iso: string) => getDb().prepare("UPDATE ai_usage SET created_at = ? WHERE rowid = (SELECT MAX(rowid) FROM ai_usage)").run(iso);

  it("não grava requisição sem nenhum token", () => {
    recordUsage({ provider: "anthropic", model: "claude-opus-5", source: "chat", usage: zero, estimated: false, aborted: true });
    expect(getUsageSummary(null).totals.requests).toBe(0);
  });

  it("agrega por modelo, por dia e soma custos", () => {
    const now = new Date(2030, 5, 15, 15, 0);
    recordUsage({ provider: "anthropic", model: "claude-opus-5", source: "chat", usage: { ...zero, inputTokens: 1000, outputTokens: 500 }, estimated: false, aborted: false });
    setCreated(new Date(2030, 5, 15, 10, 0).toISOString());
    recordUsage({ provider: "anthropic", model: "claude-opus-5", source: "council", usage: { ...zero, inputTokens: 2000, outputTokens: 100 }, estimated: false, aborted: false });
    setCreated(new Date(2030, 5, 14, 22, 30).toISOString());
    recordUsage({ provider: "openai", model: "gpt-5", source: "council", usage: { ...zero, inputTokens: 300, outputTokens: 300 }, estimated: true, aborted: false });
    setCreated(new Date(2030, 5, 15, 11, 0).toISOString());
    // Fora da janela de 7 dias:
    recordUsage({ provider: "google", model: "gemini-2.5-pro", source: "chat", usage: { ...zero, inputTokens: 9999 }, estimated: false, aborted: false });
    setCreated(new Date(2030, 4, 1, 12, 0).toISOString());

    const week = getUsageSummary(7, now);
    expect(week.totals.requests).toBe(3);
    expect(week.totals.inputTokens).toBe(3300);
    expect(week.totals.outputTokens).toBe(900);
    expect(week.totals.unpricedRequests).toBe(1); // gpt-5
    // Opus 5: 3000 entrada × 5/1M + 600 saída × 25/1M
    expect(week.totals.costUsd).toBeCloseTo(3000 * 5e-6 + 600 * 25e-6);

    expect(week.byModel[0]).toMatchObject({ provider: "anthropic", model: "claude-opus-5", requests: 2 });
    expect(week.byDay).toHaveLength(7);
    const today = week.byDay[6];
    expect(today.date).toBe("2030-06-15");
    expect(today.inputTokens + today.outputTokens).toBe(1500 + 600);
    expect(today.byProvider).toEqual({ anthropic: 1500, openai: 600 });
    // 22:30 do dia 14 no horário local continua sendo dia 14 (não vira 15 por causa do UTC).
    expect(week.byDay[5]).toMatchObject({ date: "2030-06-14", inputTokens: 2000, outputTokens: 100 });

    expect(week.recent.find((r) => r.model === "gpt-5")).toMatchObject({ estimated: true, costUsd: null });
    expect(getUsageSummary(null, now).totals.requests).toBe(4);
  });

  it("apaga o histórico", () => {
    recordUsage({ provider: "anthropic", model: "claude-haiku-4-5", source: "synthesis", usage: { ...zero, outputTokens: 10 }, estimated: false, aborted: false });
    clearUsage();
    expect(getUsageSummary(null).totals.requests).toBe(0);
  });
});
