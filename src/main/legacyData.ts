import fs from "node:fs";
import path from "node:path";

/**
 * Na 1.7.0 o app passou de "QrzSpace" para "Qyrex", e o Electron deriva a pasta
 * de dados do nome do produto (%APPDATA%\QrzSpace → %APPDATA%\Qyrex). Na primeira
 * abertura com o nome novo, copiamos banco, cofre, preferências e sessões da
 * pasta antiga. A pasta antiga fica intacta, como backup.
 *
 * Não copia caches do Chromium nem arquivos de trava da instância anterior.
 * Devolve `true` se copiou alguma coisa.
 */
const SKIP = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "GPUPersistentCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "GrShaderCache",
  "ShaderCache",
  "lockfile",
  "DevToolsActivePort",
]);

export const LEGACY_PRODUCT_NAME = "QrzSpace";
const DB_FILE = "workspace.sqlite";

export function copyLegacyUserData(legacyDir: string, targetDir: string): boolean {
  if (path.resolve(legacyDir).toLowerCase() === path.resolve(targetDir).toLowerCase()) return false;
  // Já existe um banco no destino: o app novo já foi usado, nunca sobrescrever.
  if (fs.existsSync(path.join(targetDir, DB_FILE))) return false;
  if (!fs.existsSync(path.join(legacyDir, DB_FILE))) return false;

  fs.mkdirSync(targetDir, { recursive: true });
  let copied = false;
  for (const entry of fs.readdirSync(legacyDir)) {
    if (SKIP.has(entry)) continue;
    try {
      fs.cpSync(path.join(legacyDir, entry), path.join(targetDir, entry), { recursive: true, force: false, errorOnExist: false });
      copied = true;
    } catch {
      // Um arquivo preso (ex.: antivírus) não pode impedir o app de abrir.
    }
  }
  return copied;
}
