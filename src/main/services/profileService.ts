import { app, dialog, nativeImage, type BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { tt } from "../i18n.js";

/**
 * Foto de perfil. A imagem é escolhida SEMPRE pela janela nativa do sistema
 * (o renderer nunca manda um caminho), recortada no quadrado central,
 * reduzida para 256×256 e guardada como PNG em <userData>/avatar.png.
 * Para a interface vai só como data URL (a CSP já aceita `data:`).
 */

export const AVATAR_SIZE = 256;
/** Imagens maiores que isso nem são abertas (evita travar com arquivos enormes). */
export const AVATAR_MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

function avatarFile(): string {
  return path.join(app.getPath("userData"), "avatar.png");
}

/** Maior quadrado centralizado dentro de uma imagem w×h. */
export function centerSquare(width: number, height: number): { x: number; y: number; width: number; height: number } {
  const side = Math.max(1, Math.min(width, height));
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side };
}

export function getAvatar(): string | null {
  try {
    const data = fs.readFileSync(avatarFile());
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Abre o seletor de imagens. Devolve a foto nova (data URL) ou `null` se o usuário cancelar. */
export async function pickAvatar(win: BrowserWindow | null): Promise<string | null> {
  const options = {
    title: tt("Escolher foto de perfil"),
    properties: ["openFile"] as "openFile"[],
    filters: [{ name: tt("Imagens"), extensions: IMAGE_EXTENSIONS }],
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const source = result.filePaths[0];

  const ext = path.extname(source).slice(1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error(tt("Escolha uma imagem PNG, JPG, WebP, GIF ou BMP."));
  if (fs.statSync(source).size > AVATAR_MAX_BYTES) throw new Error(tt("A imagem passa de 20 MB. Escolha uma menor."));

  const image = nativeImage.createFromPath(source);
  if (image.isEmpty()) throw new Error(tt("Não foi possível ler essa imagem."));
  const { width, height } = image.getSize();
  const square = image.crop(centerSquare(width, height)).resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, quality: "best" });

  fs.mkdirSync(path.dirname(avatarFile()), { recursive: true });
  fs.writeFileSync(avatarFile(), square.toPNG());
  return getAvatar();
}

/** Apaga a foto. Devolve `null` (a foto atual passa a ser nenhuma). */
export function removeAvatar(): null {
  fs.rmSync(avatarFile(), { force: true });
  return null;
}
