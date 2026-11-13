import { tm } from "@shared/i18n";

/**
 * Atalhos globais configuráveis (dentro da janela). Ficam no localStorage deste PC.
 * Formato legível: "Ctrl+Shift+K". Só combinações com Ctrl (ou Alt) valem, para não
 * roubar o que o usuário digita em campos de texto, no terminal ou no editor.
 */

export const SHORTCUT_ACTIONS = {
  palette: { label: tm("Abrir a paleta de comandos"), default: "Ctrl+K" },
  quickTask: { label: tm("Nova tarefa rápida"), default: "Ctrl+Shift+T" },
  projects: { label: tm("Ir para Projetos"), default: "Ctrl+Shift+P" },
  ai: { label: tm("Ir para a IA"), default: "Ctrl+Shift+A" },
  workspace: { label: tm("Ir para o Workspace"), default: "Ctrl+Shift+W" },
  preview: { label: tm("Ir para o Preview"), default: "Ctrl+Shift+V" },
  sidebar: { label: tm("Recolher/expandir a barra lateral"), default: "Ctrl+Shift+B" },
} as const;
export type ShortcutAction = keyof typeof SHORTCUT_ACTIONS;
export type ShortcutMap = Record<ShortcutAction, string>;

const KEY = "qrz.shortcuts";

export function defaultShortcuts(): ShortcutMap {
  return Object.fromEntries(Object.entries(SHORTCUT_ACTIONS).map(([k, v]) => [k, v.default])) as ShortcutMap;
}

/** Converte um evento de teclado em "Ctrl+Shift+K" (null para teclas soltas ou só modificadores). */
export function comboOf(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  if (!(e.ctrlKey || e.metaKey || e.altKey)) return null;
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(key);
  return parts.join("+");
}

/** Normaliza o que veio do storage: só ações conhecidas e combinações válidas, sem repetir. */
export function sanitizeShortcuts(raw: unknown): ShortcutMap {
  const out = defaultShortcuts();
  if (!raw || typeof raw !== "object") return out;
  const used = new Set<string>();
  for (const action of Object.keys(out) as ShortcutAction[]) {
    const v = (raw as Record<string, unknown>)[action];
    if (typeof v === "string" && /^(Ctrl\+)?(Alt\+)?(Shift\+)?[^+]+$/.test(v) && /^(Ctrl|Alt)\+/.test(v) && !used.has(v)) out[action] = v;
    used.add(out[action]);
  }
  return out;
}

export function readShortcuts(): ShortcutMap {
  try {
    return sanitizeShortcuts(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return defaultShortcuts();
  }
}

export function writeShortcuts(map: ShortcutMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // sem storage: vale só nesta sessão
  }
}

/** Qual ação esta combinação dispara (ou null). */
export function actionFor(map: ShortcutMap, combo: string | null): ShortcutAction | null {
  if (!combo) return null;
  return (Object.keys(map) as ShortcutAction[]).find((a) => map[a] === combo) ?? null;
}
