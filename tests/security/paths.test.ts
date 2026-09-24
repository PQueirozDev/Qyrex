import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertAuthorizableDir,
  assertPathAllowed,
  assertPathAllowedAndExists,
  assertSafeName,
  checkPathAgainstRoots,
  isWithin,
  PathNotAllowedError,
} from "../../src/main/security/paths";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

// Caminhos no formato do Windows só fazem sentido com o `path` do Windows.
describe.runIf(process.platform === "win32")("isWithin (Windows)", () => {
  it("aceita o próprio root e subpastas", () => {
    expect(isWithin("C:\\Projetos", "C:\\Projetos")).toBe(true);
    expect(isWithin("C:\\Projetos", "C:\\Projetos\\site\\src")).toBe(true);
  });

  it("não confunde pastas irmãs com prefixo em comum", () => {
    expect(isWithin("C:\\Proj", "C:\\Projetos\\x")).toBe(false);
  });

  it("rejeita subir de nível com ..", () => {
    expect(isWithin("C:\\Projetos", "C:\\Projetos\\..\\Windows")).toBe(false);
  });
});

describe.runIf(process.platform !== "win32")("isWithin (POSIX)", () => {
  it("aceita o próprio root e subpastas", () => {
    expect(isWithin("/projetos", "/projetos")).toBe(true);
    expect(isWithin("/projetos", "/projetos/site/src")).toBe(true);
  });

  it("não confunde pastas irmãs com prefixo em comum", () => {
    expect(isWithin("/proj", "/projetos/x")).toBe(false);
  });

  it("rejeita subir de nível com ..", () => {
    expect(isWithin("/projetos", "/projetos/../etc")).toBe(false);
  });
});

describe("checkPathAgainstRoots (path traversal)", () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pqw-root-")));
    outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pqw-out-")));
    fs.writeFileSync(path.join(outside, "segredo.txt"), "confidencial");
  });

  afterEach(() => {
    removeDir(root);
    removeDir(outside);
  });

  it("permite arquivos dentro do root", () => {
    const inside = path.join(root, "a", "b.txt");
    expect(checkPathAgainstRoots(inside, [root])).toBe(path.resolve(inside));
  });

  it("bloqueia ../ para fora do root", () => {
    const attack = path.join(root, "..", path.basename(outside), "segredo.txt");
    expect(() => checkPathAgainstRoots(attack, [root])).toThrow(PathNotAllowedError);
  });

  it("bloqueia ..\\ misturado com barras", () => {
    const attack = `${root}/sub/../../${path.basename(outside)}/segredo.txt`;
    expect(() => checkPathAgainstRoots(attack, [root])).toThrow(PathNotAllowedError);
  });

  it("bloqueia caminhos absolutos fora do root", () => {
    expect(() => checkPathAgainstRoots(path.join(outside, "segredo.txt"), [root])).toThrow(PathNotAllowedError);
  });

  it("bloqueia quando nenhum diretório foi autorizado", () => {
    expect(() => checkPathAgainstRoots(path.join(root, "x"), [])).toThrow(PathNotAllowedError);
  });

  it("bloqueia byte nulo e caminhos de dispositivo", () => {
    expect(() => checkPathAgainstRoots(`${root}\\a.txt\0.png`, [root])).toThrow();
    expect(() => checkPathAgainstRoots("\\\\?\\C:\\Windows\\win.ini", [root])).toThrow();
    expect(() => checkPathAgainstRoots("\\\\.\\PhysicalDrive0", [root])).toThrow();
    expect(() => checkPathAgainstRoots("", [root])).toThrow();
  });

  it("bloqueia junction/symlink dentro do root que aponta para fora", () => {
    const link = path.join(root, "atalho");
    fs.symlinkSync(outside, link, "junction");
    expect(fs.existsSync(path.join(link, "segredo.txt"))).toBe(true);
    expect(() => checkPathAgainstRoots(path.join(link, "segredo.txt"), [root])).toThrow(PathNotAllowedError);
  });

  it("é insensível a maiúsculas no Windows", () => {
    if (process.platform !== "win32") return;
    expect(() => checkPathAgainstRoots(path.join(root.toUpperCase(), "a.txt"), [root])).not.toThrow();
  });
});

describe("assertPathAllowed (com configurações do banco)", () => {
  let dir: string;
  beforeEach(() => {
    freshDb();
    dir = tempAllowedDir();
  });
  afterEach(() => removeDir(dir));

  it("usa a allowlist salva nas configurações", () => {
    expect(() => assertPathAllowed(path.join(dir, "x.txt"))).not.toThrow();
    expect(() => assertPathAllowed(os.homedir())).toThrow(PathNotAllowedError);
  });

  it("exige que o caminho exista quando pedido", () => {
    expect(() => assertPathAllowedAndExists(path.join(dir, "nao-existe.txt"))).toThrow(/não encontrado/);
  });
});

describe("assertSafeName", () => {
  it("aceita nomes comuns", () => {
    expect(assertSafeName("  Logo final.png ")).toBe("Logo final.png");
  });

  it.each(["..", ".", "a/b", "a\\b", "c:x", "nome?", "<x>", "a|b", "CON", "nul.txt", "LPT1", ""])(
    "rejeita %j",
    (name) => {
      expect(() => assertSafeName(name)).toThrow();
    }
  );
});

describe("assertAuthorizableDir", () => {
  it("rejeita a raiz da unidade", () => {
    expect(() => assertAuthorizableDir(path.parse(process.cwd()).root)).toThrow(/raiz/);
  });

  it("rejeita pastas do sistema", () => {
    if (!process.env.SystemRoot) return;
    expect(() => assertAuthorizableDir(process.env.SystemRoot!)).toThrow(/sistema/);
    expect(() => assertAuthorizableDir(path.join(process.env.SystemRoot!, "System32"))).toThrow(/sistema/);
  });

  it("rejeita a pasta inteira do usuário", () => {
    const home = process.env.USERPROFILE ?? process.env.HOME;
    if (!home) return;
    expect(() => assertAuthorizableDir(home)).toThrow();
  });

  it("aceita uma pasta de projetos comum", () => {
    expect(assertAuthorizableDir(path.join(os.tmpdir(), "Projetos"))).toBe(path.join(os.tmpdir(), "Projetos"));
  });
});
