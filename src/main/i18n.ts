import { getSettings } from "./database/db.js";
import { translate } from "../shared/i18n.js";
import type { Language } from "../shared/types.js";

/** Idioma atual do app (português se o banco ainda não estiver disponível). */
export function currentLanguage(): Language {
  try {
    return getSettings().language;
  } catch {
    return "pt";
  }
}

/**
 * Traduz um texto do processo main no idioma do app, com variáveis `{x}`.
 * Use para mensagens com valores dinâmicos (ex.: erros que citam um caminho),
 * que não podem ser traduzidas depois por comparação exata.
 */
export function tt(text: string, vars?: Record<string, string | number>): string {
  return translate(currentLanguage(), text, vars);
}
