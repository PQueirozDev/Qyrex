import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { EN } from "../src/shared/locales/en";
import { translate, translatePlural } from "../src/shared/i18n";

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
    expect(translate("en", "Você tem {n} tarefas para hoje.", { n: 3 })).toBe("You have 3 tasks for today.");
    expect(translate("pt", "Você tem {n} tarefas para hoje.", { n: 3 })).toBe("Você tem 3 tarefas para hoje.");
  });

  it("plural escolhe a forma pelo número antes de traduzir", () => {
    const one = "Você tem {n} tarefa para hoje.";
    const other = "Você tem {n} tarefas para hoje.";
    expect(translatePlural("pt", 1, one, other)).toBe("Você tem 1 tarefa para hoje.");
    expect(translatePlural("pt", 0, one, other)).toBe("Você tem 0 tarefas para hoje.");
    expect(translatePlural("en", 1, one, other)).toBe("You have 1 task for today.");
    expect(translatePlural("en", 4, one, other)).toBe("You have 4 tasks for today.");
  });

  it("nenhum texto usa o plural preguiçoso “(s)”", () => {
    expect([...keys.keys()].filter((k) => /\((s|es|ões)\)/.test(k))).toEqual([]);
  });

  it("texto sem tradução cai no português (nunca some da tela)", () => {
    expect(translate("en", "texto que não existe no dicionário")).toBe("texto que não existe no dicionário");
  });
});
