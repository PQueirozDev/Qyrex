// Publica o instalador na release v<versão> de PQueirozDev/QrzSpace-releases.
// Uso: npm run release  (roda check + build antes, ver package.json)
//
// O token vem do GitHub CLI (`gh auth token`) e só existe nesta execução, como
// variável de ambiente do electron-builder: ele NUNCA é embutido no app. Os
// apps instalados baixam as atualizações do repositório público, sem token.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const REPO = "PQueirozDev/QrzSpace-releases";

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", shell: false, ...options });
  if (res.error) throw res.error;
  return res;
}

const token = run("gh", ["auth", "token"]).stdout.trim();
if (!token) {
  console.error("Sem token do GitHub. Rode `gh auth login` primeiro.");
  process.exit(1);
}

const existing = run("gh", ["release", "view", `v${pkg.version}`, "--repo", REPO]);
if (existing.status === 0) {
  console.error(`A release v${pkg.version} já existe em ${REPO}. Suba a versão no package.json.`);
  process.exit(1);
}

console.log(`Publicando QrzSpace v${pkg.version} em ${REPO}...`);
const builder = run(process.execPath, ["node_modules/electron-builder/cli.js", "--win", "--x64", "--publish", "always"], {
  stdio: "inherit",
  env: { ...process.env, GH_TOKEN: token },
});
process.exit(builder.status ?? 1);
