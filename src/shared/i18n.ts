import { EN } from "./locales/en.js";
import type { Language } from "./types.js";

/**
 * Internacionalização estilo gettext: o texto em português É a chave.
 * Em inglês, procura a tradução em `locales/en.ts`; se faltar, mostra o
 * português (e o teste `tests/i18n.test.ts` acusa a chave faltando).
 * Variáveis usam `{nome}`: translate("en", "Olá, {name}", { name: "Pedro" }).
 */
export function translate(lang: Language, text: string, vars?: Record<string, string | number>): string {
  let out = lang === "en" ? (EN[text] ?? text) : text;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(String(value));
  }
  return out;
}

/**
 * Singular/plural sem "(s)": escolhe a frase pelo número ANTES de traduzir, e
 * cada forma é uma chave própria no dicionário. Em pt e en, só 1 é singular.
 * `{n}` recebe o número automaticamente:
 *   translatePlural("en", 3, "{n} tarefa", "{n} tarefas") → "3 tasks"
 */
export function translatePlural(
  lang: Language,
  n: number,
  one: string,
  other: string,
  vars?: Record<string, string | number>
): string {
  return translate(lang, n === 1 ? one : other, { n, ...vars });
}

/**
 * Marca um texto para tradução sem traduzi-lo agora (ele é traduzido depois,
 * onde for exibido). Serve para o extrator de chaves (scripts/i18n-keys.cjs).
 */
export function tm(text: string): string {
  return text;
}
