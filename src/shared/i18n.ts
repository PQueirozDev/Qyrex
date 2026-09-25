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

export function hasTranslation(text: string): boolean {
  return Object.prototype.hasOwnProperty.call(EN, text);
}

/**
 * Marca um texto para tradução sem traduzi-lo agora (ele é traduzido depois,
 * onde for exibido). Serve para o extrator de chaves (scripts/i18n-keys.cjs).
 */
export function tm(text: string): string {
  return text;
}
