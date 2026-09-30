import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { describe, expect, it } from "vitest";
import { centerSquare, getAvatar, pickAvatar, removeAvatar } from "../../src/main/services/profileService";

describe("foto de perfil", () => {
  it("recorta o maior quadrado centralizado", () => {
    expect(centerSquare(1920, 1080)).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    expect(centerSquare(600, 900)).toEqual({ x: 0, y: 150, width: 600, height: 600 });
    expect(centerSquare(256, 256)).toEqual({ x: 0, y: 0, width: 256, height: 256 });
    expect(centerSquare(0, 0).width).toBe(1);
  });

  it("lê a foto salva como data URL e apaga", () => {
    const file = path.join(app.getPath("userData"), "avatar.png");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(getAvatar()).toBe("data:image/png;base64,iVBORw==");
    expect(removeAvatar()).toBeNull();
    expect(getAvatar()).toBeNull();
    // Apagar de novo não dá erro.
    expect(removeAvatar()).toBeNull();
  });

  it("cancelar o seletor não muda nada", async () => {
    await expect(pickAvatar(null)).resolves.toBeNull();
  });
});
