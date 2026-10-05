import * as monaco from "monaco-editor";

/**
 * Configuração única do Monaco (o motor de edição do VS Code) para o editor embutido.
 *
 * Workers: o app de produção é carregado via file://, onde o Chromium não cria
 * workers a partir de arquivo. Por isso cada worker é embutido (`?worker&inline`,
 * vira um blob — a CSP libera `worker-src blob:`) e importado sob demanda: o do
 * TypeScript é grande e só é baixado quando um arquivo TS/JS é aberto.
 */
self.MonacoEnvironment = {
  async getWorker(_workerId: string, label: string): Promise<Worker> {
    switch (label) {
      case "json":
        return new (await import("monaco-editor/language/json/json.worker.js?worker&inline")).default();
      case "css":
      case "scss":
      case "less":
        return new (await import("monaco-editor/language/css/css.worker.js?worker&inline")).default();
      case "html":
      case "handlebars":
      case "razor":
        return new (await import("monaco-editor/language/html/html.worker.js?worker&inline")).default();
      case "typescript":
      case "javascript":
        return new (await import("monaco-editor/language/typescript/ts.worker.js?worker&inline")).default();
      default:
        return new (await import("monaco-editor/editor/editor.worker.js?worker&inline")).default();
    }
  },
};

// Sem o projeto inteiro (node_modules, tsconfig) a checagem semântica do TS só
// geraria falsos erros ("Cannot find module..."). Fica a checagem de sintaxe.
const tsDefaults = monaco.typescript;
for (const defaults of [tsDefaults.typescriptDefaults, tsDefaults.javascriptDefaults]) {
  defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
  defaults.setCompilerOptions({
    target: tsDefaults.ScriptTarget.ESNext,
    module: tsDefaults.ModuleKind.ESNext,
    moduleResolution: tsDefaults.ModuleResolutionKind.NodeJs,
    jsx: tsDefaults.JsxEmit.Preserve,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
  });
}

/** Linguagem do Monaco pelo nome/extensão do arquivo (cai em texto puro). */
export function languageForPath(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  for (const lang of monaco.languages.getLanguages()) {
    if (lang.filenames?.some((f) => f.toLowerCase() === name)) return lang.id;
  }
  if (ext) {
    for (const lang of monaco.languages.getLanguages()) {
      if (lang.extensions?.some((e) => e.toLowerCase() === ext)) return lang.id;
    }
  }
  if (name.startsWith(".env")) return "ini";
  return "plaintext";
}

export function languageLabel(id: string): string {
  const lang = monaco.languages.getLanguages().find((l) => l.id === id);
  return lang?.aliases?.[0] ?? id;
}

function cssHex(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = value.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return `#${parts.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Tema do Monaco montado com as cores do tema atual do Qyrex. */
export function applyQyrexTheme(): void {
  const dark = document.documentElement.classList.contains("dark");
  const bg = cssHex("--bg-elevated", dark ? "#111418" : "#ffffff");
  const hover = cssHex("--bg-hover", dark ? "#1c2026" : "#f0f1f4");
  const border = cssHex("--border-subtle", dark ? "#1c1f25" : "#e8eaee");
  const text = cssHex("--text", dark ? "#e6e8eb" : "#16181d");
  const faint = cssHex("--text-faint", dark ? "#686f7a" : "#8a909c");
  const accent = cssHex("--accent", dark ? "#688cff" : "#4c6ef5");
  monaco.editor.defineTheme("qyrex", {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": bg,
      "editor.foreground": text,
      "editorGutter.background": bg,
      "editorLineNumber.foreground": faint,
      "editorLineNumber.activeForeground": text,
      "editor.lineHighlightBackground": `${hover}80`,
      "editor.lineHighlightBorder": "#00000000",
      "editorCursor.foreground": accent,
      "editor.selectionBackground": `${accent}40`,
      "editor.inactiveSelectionBackground": `${accent}24`,
      "editorWidget.background": hover,
      "editorWidget.border": border,
      "editorIndentGuide.background1": border,
      "focusBorder": `${accent}80`,
      "scrollbarSlider.background": `${faint}33`,
      "scrollbarSlider.hoverBackground": `${faint}55`,
      "scrollbarSlider.activeBackground": `${faint}77`,
    },
  });
  monaco.editor.setTheme("qyrex");
}

export { monaco };
