import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyLegacyUserData } from "../../src/main/legacyData";

const tmp: string[] = [];
function dir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "qyrex-legacy-"));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("migração da pasta de dados (QrzSpace → Qyrex)", () => {
  it("copia banco, cofre e logs, mas não os caches do Chromium", () => {
    const legacy = dir();
    const target = path.join(dir(), "Qyrex");
    fs.writeFileSync(path.join(legacy, "workspace.sqlite"), "db");
    fs.writeFileSync(path.join(legacy, "secrets.enc.json"), "{}");
    fs.mkdirSync(path.join(legacy, "logs"));
    fs.writeFileSync(path.join(legacy, "logs", "main.log"), "ok");
    fs.mkdirSync(path.join(legacy, "GPUCache"));
    fs.writeFileSync(path.join(legacy, "lockfile"), "");

    expect(copyLegacyUserData(legacy, target)).toBe(true);
    expect(fs.readFileSync(path.join(target, "workspace.sqlite"), "utf8")).toBe("db");
    expect(fs.existsSync(path.join(target, "secrets.enc.json"))).toBe(true);
    expect(fs.readFileSync(path.join(target, "logs", "main.log"), "utf8")).toBe("ok");
    expect(fs.existsSync(path.join(target, "GPUCache"))).toBe(false);
    expect(fs.existsSync(path.join(target, "lockfile"))).toBe(false);
    // A pasta antiga fica como backup.
    expect(fs.existsSync(path.join(legacy, "workspace.sqlite"))).toBe(true);
  });

  it("nunca sobrescreve um banco que já existe no destino", () => {
    const legacy = dir();
    const target = dir();
    fs.writeFileSync(path.join(legacy, "workspace.sqlite"), "antigo");
    fs.writeFileSync(path.join(target, "workspace.sqlite"), "novo");
    expect(copyLegacyUserData(legacy, target)).toBe(false);
    expect(fs.readFileSync(path.join(target, "workspace.sqlite"), "utf8")).toBe("novo");
  });

  it("não faz nada sem dados antigos ou com a mesma pasta", () => {
    const a = dir();
    expect(copyLegacyUserData(path.join(a, "nao-existe"), path.join(a, "Qyrex"))).toBe(false);
    fs.writeFileSync(path.join(a, "workspace.sqlite"), "db");
    expect(copyLegacyUserData(a, a)).toBe(false);
  });
});
