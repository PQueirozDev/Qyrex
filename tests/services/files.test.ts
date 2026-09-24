import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as files from "../../src/main/services/fileService";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

let dir: string;

beforeEach(() => {
  freshDb();
  dir = tempAllowedDir();
  fs.mkdirSync(path.join(dir, "Sites"));
  fs.writeFileSync(path.join(dir, "Sites", "index.html"), "<h1>oi</h1>");
  fs.writeFileSync(path.join(dir, "notas.md"), "# Notas");
});

afterEach(() => removeDir(dir));

describe("fileService", () => {
  it("lista pastas primeiro", () => {
    const entries = files.listDir(dir);
    expect(entries[0]).toMatchObject({ name: "Sites", isDirectory: true });
  });

  it("cria, renomeia, copia e move dentro da allowlist", () => {
    const created = files.createFolder(dir, "Clientes");
    expect(fs.existsSync(created.path)).toBe(true);

    const renamed = files.renameEntry(path.join(dir, "notas.md"), "README.md");
    expect(path.basename(renamed)).toBe("README.md");

    const copy = files.copyEntry(renamed, created.path);
    expect(fs.existsSync(copy)).toBe(true);
    const copy2 = files.copyEntry(renamed, created.path);
    expect(path.basename(copy2)).toBe("README (cópia).md");

    const moved = files.moveEntry(path.join(dir, "Sites"), created.path);
    expect(fs.existsSync(path.join(moved, "index.html"))).toBe(true);
  });

  it("bloqueia nomes com traversal ao criar/renomear", () => {
    expect(() => files.createFolder(dir, "..\\..\\fora")).toThrow();
    expect(() => files.renameEntry(path.join(dir, "notas.md"), "../fora.md")).toThrow();
  });

  it("bloqueia copiar pasta para dentro dela mesma", () => {
    expect(() => files.copyEntry(path.join(dir, "Sites"), path.join(dir, "Sites"))).toThrow(/dentro dela mesma/);
  });

  it("não permite excluir nem renomear o diretório autorizado raiz", () => {
    expect(() => files.deleteEntry(dir)).toThrow(/raiz/);
    expect(() => files.renameEntry(dir, "outro")).toThrow(/raiz/);
  });

  it("bloqueia leitura fora da allowlist", () => {
    expect(() => files.listDir(path.join(dir, ".."))).toThrow(/Acesso negado/);
    expect(() => files.previewFile(path.join(dir, "..", "..", "Windows", "win.ini"))).toThrow();
  });

  it("gera preview de texto, imagem e binário", () => {
    const md = files.previewFile(path.join(dir, "notas.md"));
    expect(md).toMatchObject({ kind: "text", language: "markdown", content: "# Notas" });

    fs.writeFileSync(path.join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const img = files.previewFile(path.join(dir, "logo.png"));
    expect(img.kind).toBe("image");
    if (img.kind === "image") expect(img.dataUrl.startsWith("data:image/png;base64,")).toBe(true);

    fs.writeFileSync(path.join(dir, "app.bin"), Buffer.from([1, 0, 2, 0, 3]));
    expect(files.previewFile(path.join(dir, "app.bin")).kind).toBe("binary");
  });

  it("pesquisa por nome ignorando node_modules", () => {
    fs.mkdirSync(path.join(dir, "node_modules", "index-lib"), { recursive: true });
    const results = files.searchFiles("index");
    expect(results.map((r) => r.name)).toEqual(["index.html"]);
  });
});
