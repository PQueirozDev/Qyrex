// Gera os ícones do app a partir de build/icon.svg (a fonte do desenho):
//   build/icon.png  (512×512 — janela, bandeja, Linux/macOS)
//   build/icon.ico  (16–256 px — instalador e .exe no Windows)
//   build/installerSidebar.bmp, uninstallerSidebar.bmp e installerHeader.bmp
//     (artes do instalador NSIS, ver scripts/icons/installer.cjs)
//
// O SVG é rasterizado pelo próprio Electron (janela invisível) em 1024 px e
// reduzido com boa qualidade para cada tamanho. O .ico guarda cada tamanho
// como PNG (formato aceito pelo Windows desde o Vista).
//
// Uso: npm run icons

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const electron = (await import("electron")).default;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
for (const script of ["render.cjs", "installer.cjs"]) {
  const res = spawnSync(electron, [path.join(here, "icons", script)], { stdio: "inherit", env, cwd: path.resolve(here, "..") });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
