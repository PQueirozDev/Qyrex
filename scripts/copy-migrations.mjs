import fs from "node:fs";
import path from "node:path";

// Passo pós-`tsc` do processo main:
// 1. copia as migrations .sql (o tsc só emite .js);
// 2. grava um package.json com "type": "commonjs" em dist-electron/, porque o
//    package.json da raiz é "type": "module" (exigido pelo Vite/Tailwind) e o
//    main/preload são compilados como CommonJS.
const src = path.resolve("src/main/database/migrations");
const outRoot = path.resolve("dist-electron");
const dest = path.join(outRoot, "main/database/migrations");

fs.mkdirSync(dest, { recursive: true });

for (const file of fs.readdirSync(src)) {
  if (file.endsWith(".sql")) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
  }
}

fs.writeFileSync(path.join(outRoot, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2) + "\n");

console.log(`Migrations copiadas para ${dest}`);
