import { beforeEach, describe, expect, it } from "vitest";
import { addActiveSeconds, computeStreaks, getAppUsageSummary, localDay, recordSession } from "../../src/main/services/appUsageService";
import { freshDb } from "../helpers";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("tempo de uso do app", () => {
  beforeEach(() => {
    freshDb();
  });

  it("soma segundos e sessões por dia local", () => {
    const day = at(2026, 9, 30, 23);
    recordSession(day);
    recordSession(day);
    addActiveSeconds(30, day);
    addActiveSeconds(30, day);
    addActiveSeconds(0, day);
    const s = getAppUsageSummary(1, day);
    expect(s.days).toEqual([{ day: "2026-09-30", seconds: 60, sessions: 2 }]);
    expect(s.todaySeconds).toBe(60);
  });

  it("preenche dias sem uso com zero, em ordem crescente", () => {
    addActiveSeconds(120, at(2026, 9, 28));
    const s = getAppUsageSummary(3, at(2026, 9, 30));
    expect(s.days.map((d) => [d.day, d.seconds])).toEqual([
      ["2026-09-28", 120],
      ["2026-09-29", 0],
      ["2026-09-30", 0],
    ]);
    expect(s.activeDays).toBe(1);
    expect(s.totalSeconds).toBe(120);
    expect(s.firstDay).toBe("2026-09-28");
  });

  it("abrir sem usar não conta como dia usado", () => {
    recordSession(at(2026, 9, 30));
    const s = getAppUsageSummary(7, at(2026, 9, 30));
    expect(s.activeDays).toBe(0);
    expect(s.currentStreak).toBe(0);
  });

  it("calcula sequência atual e recorde", () => {
    expect(computeStreaks(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-10", "2026-09-29", "2026-09-30"], "2026-09-30")).toEqual({
      current: 2,
      longest: 3,
    });
    // Hoje ainda sem uso não zera a sequência que vem até ontem.
    expect(computeStreaks(["2026-09-28", "2026-09-29"], "2026-09-30").current).toBe(2);
    expect(computeStreaks(["2026-09-27"], "2026-09-30").current).toBe(0);
    // Virada de mês e de ano.
    expect(computeStreaks(["2025-12-31", "2026-01-01"], "2026-01-01")).toEqual({ current: 2, longest: 2 });
  });

  it("usa a data local", () => {
    expect(localDay(at(2026, 1, 5, 0))).toBe("2026-01-05");
  });
});
