// Publica o instalador na release v<versão> de PQueirozDev/QrzSpace-releases.
// Uso: npm run release  (roda check + build antes, ver package.json)
//
// 1. electron-builder gera o instalador, o .blockmap e o latest.yml (sem publicar);
// 2. o GitHub CLI (`gh`, já autenticado) cria a tag/release com as patch notes do
//    changelog e envia os três arquivos de uma vez.
// Nenhum token é embutido no app: os apps instalados baixam do repositório público.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const REPO = "PQueirozDev/QrzSpace-releases";
const tag = `v${pkg.version}`;

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", shell: false, ...options });
  if (res.error) throw res.error;
  return res;
}

if (run("gh", ["release", "view", tag, "--repo", REPO]).status === 0) {
  console.error(`A release ${tag} já existe em ${REPO}. Suba a versão no package.json.`);
  process.exit(1);
}

// Patch notes vindas do changelog compilado (npm run build gera dist-electron/shared).
const { CHANGELOG } = require(path.resolve("dist-electron/shared/changelog.js"));
const entry = CHANGELOG.find((e) => e.version === pkg.version);
if (!entry) {
  console.error(`src/shared/changelog.ts não tem a versão ${pkg.version}.`);
  process.exit(1);
}
const LABEL = { new: ["Novo", "New"], improved: ["Melhorado", "Improved"], fixed: ["Corrigido", "Fixed"], security: ["Segurança", "Security"] };
const section = (lang) =>
  entry.sections
    .map((s) => `### ${LABEL[s.kind][lang === "pt" ? 0 : 1]}\n${s.items.map((i) => `- ${i[lang]}`).join("\n")}`)
    .join("\n\n");
const notes = [
  `## ${entry.title.pt}`,
  section("pt"),
  "---",
  `## ${entry.title.en}`,
  section("en"),
  "---",
  "Baixe `Qyrex-Setup-" + pkg.version + ".exe`. Quem já tem o app instalado recebe a atualização automaticamente.",
].join("\n\n");

console.log(`Gerando o instalador ${tag}...`);
const build = run(process.execPath, ["node_modules/electron-builder/cli.js", "--win", "--x64", "--publish", "never"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const files = [`Qyrex-Setup-${pkg.version}.exe`, `Qyrex-Setup-${pkg.version}.exe.blockmap`, "latest.yml"].map((f) => path.join("release", f));
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error(`Arquivo esperado não foi gerado: ${f}`);
    process.exit(1);
  }
}

console.log(`Publicando ${tag} em ${REPO}...`);
const notesFile = path.join("release", "release-notes.md");
fs.writeFileSync(notesFile, notes);
const created = run(
  "gh",
  ["release", "create", tag, ...files, "--repo", REPO, "--title", `Qyrex ${pkg.version}`, "--notes-file", notesFile, "--latest"],
  { stdio: "inherit" }
);
process.exit(created.status ?? 1);
