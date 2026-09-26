import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "", isPackaged: false }, safeStorage: {} }));

import { parseClaudeUsage, parseCodexLimits, parseResetText } from "../../src/main/integrations/cli/limits";

const now = new Date(2026, 8, 25, 23, 51); // 25/09/2026 23:51 (hora local)

describe("Limites da assinatura: Claude Code /usage", () => {
  it("lê sessão, semana e janelas de modelo", () => {
    const text = [
      "You are currently using your subscription to power your Claude Code usage",
      "",
      "Current session: 31% used · resets Sep 26, 4:19am (America/Sao_Paulo)",
      "Current week (all models): 91% used · resets Sep 26, 1:59am (America/Sao_Paulo)",
      "Current week (Opus only): 0% used",
      "",
      "Last 24h · 758 requests · 5 sessions",
    ].join("\n");
    const w = parseClaudeUsage(text, now);
    expect(w.map((x) => [x.kind, x.label, x.usedPercent])).toEqual([
      ["session", null, 31],
      ["week", null, 91],
      ["model", "Opus", 0],
    ]);
    expect(new Date(w[0].resetsAt!).getTime()).toBe(new Date(2026, 8, 26, 4, 19).getTime());
    expect(w[2].resetsAt).toBeNull();
  });

  it("não inventa números quando não há linhas de uso", () => {
    expect(parseClaudeUsage("Not logged in", now)).toEqual([]);
  });

  it("interpreta horários do reset", () => {
    expect(parseResetText("4:19am", now)?.getTime()).toBe(new Date(2026, 8, 26, 4, 19).getTime()); // já passou hoje → amanhã
    expect(parseResetText("11:55pm", now)?.getTime()).toBe(new Date(2026, 8, 25, 23, 55).getTime());
    expect(parseResetText("Oct 2 at 3pm", now)?.getTime()).toBe(new Date(2026, 9, 2, 15, 0).getTime());
    expect(parseResetText("Jan 3, 9am", now)?.getTime()).toBe(new Date(2027, 0, 3, 9, 0).getTime());
    expect(parseResetText("soon", now)).toBeNull();
  });
});

describe("Limites da assinatura: Codex app-server", () => {
  it("converte janelas, plano, créditos e bloqueio", () => {
    const r = parseCodexLimits({
      ordinaryUsageAllowed: true,
      rateLimits: {
        limitId: "codex",
        primary: { usedPercent: 13, windowDurationMins: 300, resetsAt: 1790392211 },
        secondary: { usedPercent: 49, windowDurationMins: 10080, resetsAt: 1790801486 },
        planType: "plus",
        rateLimitReachedType: null,
      },
      rateLimitsByLimitId: { codex: { limitId: "codex" }, other: { limitName: "GPT-5 Pro", secondary: { usedPercent: 5, windowDurationMins: 10080, resetsAt: null } } },
      rateLimitResetCredits: { availableCount: 1 },
    });
    expect(r.plan).toBe("plus");
    expect(r.resetCredits).toBe(1);
    expect(r.limited).toBe(false);
    expect(r.windows.map((w) => [w.kind, w.label, w.usedPercent])).toEqual([
      ["session", null, 13],
      ["week", null, 49],
      ["model", "GPT-5 Pro", 5],
    ]);
    expect(r.windows[0].resetsAt).toBe(new Date(1790392211 * 1000).toISOString());
  });

  it("marca limite atingido", () => {
    expect(parseCodexLimits({ ordinaryUsageAllowed: false, rateLimits: {} }).limited).toBe(true);
  });
});
