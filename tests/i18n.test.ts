import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { EN } from "../src/shared/locales/en";
import { translate } from "../src/shared/i18n";

const require = createRequire(import.meta.url);
const { extractKeys } = require("../scripts/i18n-keys.cjs") as { extractKeys: (root: string) => Map<string, string> };
const keys = extractKeys(path.resolve(__dirname, ".."));

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("i18n", () => {
  it("encontra as chaves usadas no código", () => {
    expect(keys.size).toBeGreaterThan(500);
  });

  it("toda chave usada no código tem tradução em inglês", () => {
    const missing = [...keys.entries()].filter(([k]) => !(k in EN)).map(([k, file]) => `${file}: ${k}`);
    expect(missing).toEqual([]);
  });

  it("nenhuma tradução está vazia", () => {
    expect(Object.entries(EN).filter(([, v]) => !v.trim())).toEqual([]);
  });

  it("placeholders {x} são os mesmos em pt e en", () => {
    const mismatched = Object.entries(EN).filter(([pt, en]) => placeholders(pt).join() !== placeholders(en).join());
    expect(mismatched).toEqual([]);
  });

  it("não sobra chave morta no dicionário", () => {
    const unused = Object.keys(EN).filter((k) => !keys.has(k));
    expect(unused).toEqual([]);
  });

  it("traduz e interpola variáveis", () => {
    expect(translate("en", "Você tem {n} tarefa(s) para hoje.", { n: 3 })).toBe("You have 3 task(s) for today.");
    expect(translate("pt", "Você tem {n} tarefa(s) para hoje.", { n: 3 })).toBe("Você tem 3 tarefa(s) para hoje.");
  });

  it("texto sem tradução cai no português (nunca some da tela)", () => {
    expect(translate("en", "texto que não existe no dicionário")).toBe("texto que não existe no dicionário");
  });
});
