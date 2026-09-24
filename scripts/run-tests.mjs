import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

// Os testes rodam dentro do runtime Node embutido no Electron
// (ELECTRON_RUN_AS_NODE=1), para que módulos nativos como better-sqlite3
// sejam carregados exatamente com o mesmo ABI usado pelo app.
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const vitestBin = path.resolve("node_modules/vitest/vitest.mjs");

const result = spawnSync(electronPath, [vitestBin, "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});

process.exit(result.status ?? 1);
