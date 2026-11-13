import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanLanguages } from "../../src/main/services/projectInsightsService";
import { bucketByWeek } from "../../src/main/services/gitService";
import { removeDir, tempAllowedDir } from "../helpers";

let dir: string;
beforeEach(() => {
  dir = tempAllowedDir("pqw-insights-");
});
afterEach(() => removeDir(dir));

const write = (rel: string, bytes: number) => {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "x".repeat(bytes));
};

describe("insights: linguagens", () => {
  it("soma bytes por linguagem e ignora dependências, builds, minificados e .d.ts", () => {
    write("src/app.ts", 600);
    write("src/ui.tsx", 200);
    write("src/style.css", 200);
    write("node_modules/lib/index.js", 50_000);
    write("dist/bundle.js", 50_000);
    write("public/vendor.min.js", 50_000);
    write("src/types.d.ts", 50_000);
    write("README.md", 9000);
    const langs = scanLanguages(dir);
    expect(langs.map((l) => [l.name, l.percent])).toEqual([
      ["TypeScript", 80],
      ["CSS", 20],
    ]);
    expect(langs[0].color).toBe("#3178c6");
  });

  it("pasta sem código devolve lista vazia", () => {
    write("notas.txt", 100);
    expect(scanLanguages(dir)).toEqual([]);
  });

  it("agrupa o excedente de 5 linguagens em \"Outras\"", () => {
    ["a.ts", "b.py", "c.go", "d.rs", "e.java", "f.rb", "g.php"].forEach((f, i) => write(f, 1000 - i * 100));
    const langs = scanLanguages(dir);
    expect(langs).toHaveLength(6);
    expect(langs[5].name).toBe("Outras");
  });
});

describe("insights: commits por semana", () => {
  it("coloca cada commit na semana certa (a última posição é a semana atual)", () => {
    const now = Date.UTC(2026, 10, 13, 12);
    const day = 24 * 3600;
    const s = (daysAgo: number) => String(Math.floor(now / 1000) - daysAgo * day);
    const raw = [s(0), s(1), s(8), s(8.5), s(83), s(90), "lixo", ""].join("\n");
    const weeks = bucketByWeek(raw, 12, now);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toBe(2);
    expect(weeks[10]).toBe(2);
    expect(weeks[0]).toBe(1); // 83 dias = semana 11 para trás
    expect(weeks.reduce((a, b) => a + b, 0)).toBe(5); // 90 dias fica fora da janela
  });
});
