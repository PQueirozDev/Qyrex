// Refaz as imagens do README (docs/screenshots/) a partir da demo web.
// Uso: npm run build:demo && npm run screenshots

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const electron = (await import("electron")).default;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const res = spawnSync(electron, [path.join(here, "screenshots.cjs")], { stdio: "inherit", env, cwd: path.resolve(here, "..") });
process.exit(res.status ?? 1);
