import type { ThemeId } from "@shared/types";
import { tr } from "@/lib/i18n";

/**
 * Catálogo de temas. As cores reais ficam em styles/index.css
 * (`:root[data-theme="<id>"]`); aqui ficam nome, descrição, se é escuro
 * e as cores da miniatura mostrada no seletor de Configurações.
 */
export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  /** Tema escuro (ativa a classe `dark` e o destaque de código escuro). */
  dark: boolean;
  preview: { bg: string; sidebar: string; card: string; border: string; text: string; muted: string; accent: string };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "dark",
    name: tr("Escuro"),
    description: tr("Grafite neutro com azul. O padrão."),
    dark: true,
    preview: { bg: "#0b0d10", sidebar: "#111418", card: "#15181d", border: "#262a31", text: "#e6e8eb", muted: "#686f7a", accent: "#688cff" },
  },
  {
    id: "light",
    name: tr("Claro"),
    description: tr("Limpo e neutro para ambientes iluminados."),
    dark: false,
    preview: { bg: "#f6f7f9", sidebar: "#ffffff", card: "#ffffff", border: "#dee1e6", text: "#16181d", muted: "#8a909c", accent: "#4c6ef5" },
  },
  {
    id: "midnight",
    name: tr("Meia-noite"),
    description: tr("Azul profundo com destaque ciano."),
    dark: true,
    preview: { bg: "#070b16", sidebar: "#0b1120", card: "#0f172a", border: "#1e293b", text: "#e2e8f0", muted: "#64748b", accent: "#22d3ee" },
  },
  {
    id: "violet",
    name: tr("Violeta"),
    description: tr("Escuro aveludado com lilás."),
    dark: true,
    preview: { bg: "#0d0b14", sidebar: "#13101c", card: "#181423", border: "#2a2438", text: "#ebe7f5", muted: "#7a7190", accent: "#a78bfa" },
  },
  {
    id: "sand",
    name: tr("Areia"),
    description: tr("Claro e quente, com terracota."),
    dark: false,
    preview: { bg: "#f7f3ec", sidebar: "#fbf8f3", card: "#fffdf9", border: "#e7dfd2", text: "#2b241c", muted: "#978a78", accent: "#c95a26" },
  },
  {
    id: "onsen",
    name: tr("Onsen"),
    description: tr("Noite azul e laranja de yuzu, as cores da capivara."),
    dark: true,
    preview: { bg: "#0d1020", sidebar: "#11152a", card: "#151a32", border: "#282f52", text: "#eef0f8", muted: "#6870a0", accent: "#ff9a3c" },
  },
];

export function getTheme(id: ThemeId | "system", prefersDark: boolean): ThemeDefinition {
  const resolved = id === "system" ? (prefersDark ? "dark" : "light") : id;
  return THEMES.find((t) => t.id === resolved) ?? THEMES[0];
}
