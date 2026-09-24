// Codemod (uso único no desenvolvimento): envolve textos visíveis da UI em tr().
// Uso: node scripts/i18n-codemod.cjs <arquivos...>
const fs = require("node:fs");
const ts = require("typescript");

const ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label", "description", "hint", "confirmLabel", "emptyText"]);
const PROPS = new Set(["label", "title", "description", "hint", "confirmLabel", "placeholder", "name", "text", "reason"]);
const CALLS = new Set(["attempt", "success", "error", "info", "setError", "setRunError"]);
const SKIP_JSX_ATTRS = new Set(["className", "key", "type", "value", "href", "id", "role", "name", "style", "data-testid"]);

const hasLetters = (s) => /[A-Za-zÀ-ÿ]/.test(s);
function looksLikeUiText(s) {
  if (!hasLetters(s)) return false;
  if (/^[a-z0-9_\-:./#@]+$/.test(s)) return false; // ids, chaves, classes
  if (/^(https?:|mailto:|tel:|file:|[A-Z]:\\)/.test(s)) return false;
  if (/^(bg|text|border|flex|grid|px|py|mt|mb|h-|w-|rounded)/.test(s) && !/[À-ÿ]/.test(s) && s.includes("-")) return false;
  return /\s/.test(s) || /^[A-ZÀ-Ý]/.test(s) || /[À-ÿ]/.test(s);
}

function isInsideTrCall(node) {
  const p = node.parent;
  return p && ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "tr";
}

function jsxAttrName(attr) {
  return attr.name.getText();
}

function processFile(file) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const lit = (s) => `tr(${JSON.stringify(s)})`;

  function visit(node) {
    if (ts.isJsxText(node)) {
      const raw = node.getFullText();
      if (hasLetters(raw) && !raw.includes("{") && !raw.includes("}")) {
        const norm = raw.replace(/\s+/g, " ").trim();
        const lead = /^[ \t]+\S/.test(raw) && !/^\s*\n/.test(raw);
        const trail = /\S[ \t]+$/.test(raw) && !/\n\s*$/.test(raw);
        const rep = `${lead ? '{" "}' : ""}{${lit(norm)}}${trail ? '{" "}' : ""}`;
        edits.push([node.getFullStart(), node.getEnd(), rep]);
      }
      return;
    }

    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isInsideTrCall(node)) {
      const text = node.text;
      const parent = node.parent;

      // <input placeholder="..." />
      if (ts.isJsxAttribute(parent)) {
        if (ATTRS.has(jsxAttrName(parent)) && looksLikeUiText(text)) edits.push([node.getStart(), node.getEnd(), `{${lit(text)}}`]);
        return;
      }

      if (!looksLikeUiText(text)) return;

      // { label: "Hoje" }
      if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        const key = parent.name.getText().replace(/["']/g, "");
        if (PROPS.has(key)) edits.push([node.getStart(), node.getEnd(), lit(text)]);
        return;
      }

      // attempt(p, "Salvo"), toast.success("...")
      if (ts.isCallExpression(parent)) {
        const callee = parent.expression;
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
        if (CALLS.has(name)) edits.push([node.getStart(), node.getEnd(), lit(text)]);
        return;
      }

      // Texto dentro de {cond ? "a" : "b"} / {x || "..."} em filhos JSX ou atributos de texto.
      let cur = parent;
      while (cur && (ts.isConditionalExpression(cur) || ts.isBinaryExpression(cur) || ts.isParenthesizedExpression(cur))) cur = cur.parent;
      if (cur && ts.isJsxExpression(cur)) {
        const owner = cur.parent;
        const ok =
          ts.isJsxElement(owner) ||
          ts.isJsxFragment(owner) ||
          (ts.isJsxAttribute(owner) && !SKIP_JSX_ATTRS.has(jsxAttrName(owner)) && ATTRS.has(jsxAttrName(owner)));
        if (ok) edits.push([node.getStart(), node.getEnd(), lit(text)]);
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (edits.length === 0) return 0;
  edits.sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [start, end, rep] of edits) out = out.slice(0, start) + rep + out.slice(end);

  if (!/import \{[^}]*\btr\b[^}]*\} from "@\/lib\/i18n"/.test(out)) {
    const imports = [...out.matchAll(/^import [\s\S]*?;\s*$/gm)];
    const last = imports[imports.length - 1];
    const at = last ? last.index + last[0].length : 0;
    out = out.slice(0, at) + `\nimport { tr } from "@/lib/i18n";` + out.slice(at);
  }
  fs.writeFileSync(file, out);
  return edits.length;
}

let total = 0;
for (const file of process.argv.slice(2)) {
  const n = processFile(file);
  total += n;
  console.log(`${String(n).padStart(4)}  ${file}`);
}
console.log(`total: ${total}`);
