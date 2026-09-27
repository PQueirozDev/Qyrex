import { translate, translatePlural } from "@shared/i18n";
import type { Language } from "@shared/types";

/**
 * Idioma da interface. É lido de forma síncrona do localStorage antes de
 * qualquer tela montar, para que textos definidos no topo dos módulos
 * (ex.: rótulos da sidebar) já saiam no idioma certo. Ao trocar o idioma em
 * Configurações, a janela recarrega (ver `syncLanguage`).
 */
const STORAGE_KEY = "qrz.language";

function readStored(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "pt";
  } catch {
    return "pt";
  }
}

let current: Language = readStored();
document.documentElement.lang = current === "en" ? "en" : "pt-BR";

/** Traduz um texto da interface (a chave é o próprio texto em português). */
export function tr(text: string, vars?: Record<string, string | number>): string {
  return translate(current, text, vars);
}

/** Traduz escolhendo singular ou plural pelo número (`{n}` é preenchido sozinho). */
export function trn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  return translatePlural(current, n, one, other, vars);
}

export function getLanguage(): Language {
  return current;
}

/** Locale para Intl (datas, números, moeda). */
export function getLocale(): string {
  return current === "en" ? "en-US" : "pt-BR";
}

/**
 * Alinha o idioma com o salvo no banco. Se mudou, recarrega a janela para
 * todos os textos (inclusive os de módulo) serem recriados.
 */
export function syncLanguage(language: Language): void {
  if (language === current) return;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // sem storage: segue no idioma atual até a próxima abertura
  }
  current = language;
  window.location.reload();
}
