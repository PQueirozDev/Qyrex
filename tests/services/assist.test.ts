import { describe, expect, it } from "vitest";
import { joinDiffs, previousWorkdayStart } from "../../src/main/services/assistService";

describe("assistentes: contexto", () => {
  it("o último dia útil volta para a sexta na segunda-feira (e no domingo)", () => {
    // 2026-11-16 é segunda-feira.
    const monday = previousWorkdayStart(new Date(2026, 10, 16, 9, 30));
    expect([monday.getDate(), monday.getDay(), monday.getHours()]).toEqual([13, 5, 0]);
    const sunday = previousWorkdayStart(new Date(2026, 10, 15, 20));
    expect(sunday.getDate()).toBe(13);
    const wednesday = previousWorkdayStart(new Date(2026, 10, 18, 8));
    expect(wednesday.getDate()).toBe(17);
  });

  it("junta os diffs e corta no limite, avisando quantos arquivos havia", () => {
    const diffs = [
      { file: "a.ts", status: "M", diff: "+".repeat(50), binary: false },
      { file: "logo.png", status: "A", diff: "", binary: true },
      { file: "b.ts", status: "M", diff: "-".repeat(500), binary: false },
    ];
    const out = joinDiffs(diffs, 200);
    expect(out).toContain("--- a.ts (M)");
    expect(out).toContain("--- logo.png (A, binário)");
    expect(out).not.toContain("b.ts (M)");
    expect(out).toContain("3 arquivos no total");
  });
});
