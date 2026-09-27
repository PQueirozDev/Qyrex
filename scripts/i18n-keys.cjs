// Extrai todas as chaves de tradução do código (usado pelo teste de i18n e
// para manter src/shared/locales/en.ts completo).
//   - tr("...") / translate(lang, "...") / tr(err.message) não conta
//   - trn(n, "singular", "plural") / translatePlural(lang, n, "singular", "plural")
//   - mensagens de erro do main: new Error("...") e mensagens do zod
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function extractKeys(root) {
  const keys = new Map(); // chave -> primeiro arquivo onde aparece
  const add = (k, file) => {
    if (!keys.has(k)) keys.set(k, path.relative(root, file));
  };
  const files = walk(path.join(root, "src"));
  for (const file of files) {
    if (file.includes(`${path.sep}locales${path.sep}`)) continue;
    const src = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const isMain = file.includes(`${path.sep}main${path.sep}`);
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(sf);
        const args = node.arguments;
        const literal = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;
        if ((callee === "tr" || callee === "tm" || callee === "tt") && literal(args[0]) !== null) add(literal(args[0]), file);
        if (callee === "translate" && literal(args[1]) !== null) add(literal(args[1]), file);
        // Plurais: trn(n, "um", "vários") e translatePlural(lang, n, "um", "vários") — as duas formas são chaves.
        const pluralAt = callee === "trn" ? 1 : callee === "translatePlural" ? 2 : -1;
        if (pluralAt >= 0) {
          for (const arg of [args[pluralAt], args[pluralAt + 1]]) if (literal(arg) !== null) add(literal(arg), file);
        }
        // Mensagens de erro exibidas pelo main (traduzidas no handler IPC)
        if (isMain && /\.(regex|refine|min|max)$/.test(callee)) {
          const msg = literal(args[args.length - 1]);
          if (msg && /[A-Za-zÀ-ÿ]{3}/.test(msg) && /\s/.test(msg)) add(msg, file);
        }
      }
      if (isMain && ts.isNewExpression(node) && node.expression.getText(sf) === "Error") {
        const arg = node.arguments && node.arguments[0];
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) add(arg.text, file);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return keys;
}

module.exports = { extractKeys };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const keys = extractKeys(root);
  const { EN } = (() => {
    try {
      const src = fs.readFileSync(path.join(root, "src/shared/locales/en.ts"), "utf8");
      // Avalia o objeto literal sem compilar o TS inteiro.
      const body = src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1);
      return { EN: Function(`return (${body});`)() };
    } catch {
      return { EN: {} };
    }
  })();
  const missing = [...keys.keys()].filter((k) => !(k in EN));
  if (process.argv.includes("--missing")) {
    for (const k of missing) console.log(JSON.stringify(k));
  } else {
    console.log(`${keys.size} chaves, ${missing.length} sem tradução`);
  }
}
