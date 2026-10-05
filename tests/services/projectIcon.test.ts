import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findProjectIconFile, findProjectIconFiles, fitInside, removeCustomIcon, resolveProjectIcon } from "../../src/main/services/projectIconService";
import * as projects from "../../src/main/services/projectService";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';

let dir: string;

function touch(rel: string, content: string | Buffer = "x") {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

beforeEach(() => {
  freshDb();
  dir = tempAllowedDir();
});

afterEach(() => removeDir(dir));

describe("detecção do ícone do projeto", () => {
  it("não acha nada numa pasta sem imagens de ícone", () => {
    touch("README.md");
    touch("src/foto-praia.png");
    expect(findProjectIconFile(dir)).toBeNull();
  });

  it("prefere o ícone do app ao favicon", () => {
    touch("public/favicon.ico");
    touch("public/logo192.png");
    expect(findProjectIconFile(dir)).toBe(path.join(dir, "public", "logo192.png"));
    touch("build/icon.png");
    expect(findProjectIconFile(dir)).toBe(path.join(dir, "build", "icon.png"));
  });

  it("usa o ícone apontado no package.json (electron-builder) e no app.json (Expo)", () => {
    touch("public/favicon.svg", SVG);
    touch("art/marca.png");
    touch("package.json", JSON.stringify({ name: "x", build: { icon: "art/marca" } }));
    expect(findProjectIconFile(dir)).toBe(path.join(dir, "art", "marca.png"));

    fs.rmSync(path.join(dir, "package.json"));
    touch("media/app.png");
    touch("app.json", JSON.stringify({ expo: { icon: "./media/app.png" } }));
    expect(findProjectIconFile(dir)).toBe(path.join(dir, "media", "app.png"));
  });

  it("varre pastas comuns quando o nome não é um dos conhecidos", () => {
    touch("assets/app-logo.webp");
    touch("assets/favicon-32x32.png");
    expect(findProjectIconFile(dir)).toBe(path.join(dir, "assets", "app-logo.webp"));
  });

  it("ignora configuração que aponta para fora da pasta do projeto", () => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pqw-out-")));
    try {
      fs.writeFileSync(path.join(outside, "segredo.png"), "x");
      touch("package.json", JSON.stringify({ build: { icon: path.join(outside, "segredo.png") } }));
      expect(findProjectIconFile(dir)).toBeNull();
    } finally {
      removeDir(outside);
    }
  });

  it.runIf(process.platform === "win32")("não segue junction que sai da pasta do projeto", () => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pqw-out-")));
    try {
      fs.writeFileSync(path.join(outside, "logo.png"), "x");
      fs.symlinkSync(outside, path.join(dir, "public"), "junction");
      expect(findProjectIconFile(dir)).toBeNull();
    } finally {
      removeDir(outside);
    }
  });

  it("reduz mantendo a proporção e nunca amplia", () => {
    expect(fitInside(512, 512, 96)).toEqual({ width: 96, height: 96 });
    expect(fitInside(400, 100, 96)).toEqual({ width: 96, height: 24 });
    expect(fitInside(32, 32, 96)).toEqual({ width: 32, height: 32 });
  });

  it("entrega SVG como data URL e respeita o modo do projeto", () => {
    fs.mkdirSync(path.join(dir, "app"));
    fs.writeFileSync(path.join(dir, "app", "logo.svg"), SVG);
    const p = projects.createProject({ name: "App", localPath: path.join(dir, "app") });
    expect(p.iconMode).toBe("auto");

    const expected = `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`;
    expect(resolveProjectIcon(p)).toBe(expected);

    expect(projects.setIconMode(p.id, "none")).toBeNull();
    expect(projects.getProject(p.id)?.iconMode).toBe("none");
    expect(projects.setIconMode(p.id, "auto")).toBe(expected);
  });

  it("não lê ícone de pasta fora da allowlist", () => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pqw-out-")));
    try {
      fs.writeFileSync(path.join(outside, "logo.svg"), SVG);
      expect(resolveProjectIcon({ id: "x", localPath: outside, iconMode: "auto" })).toBeNull();
    } finally {
      removeDir(outside);
    }
  });

  it("lista os candidatos em ordem para cair no próximo se o melhor estiver corrompido", () => {
    touch("build/icon.png");
    touch("public/favicon.ico");
    touch("assets/logo-full.svg", SVG);
    expect(findProjectIconFiles(dir)).toEqual([
      path.join(dir, "build", "icon.png"),
      path.join(dir, "public", "favicon.ico"),
      path.join(dir, "assets", "logo-full.svg"),
    ]);
  });

  it("recusa id de projeto com caminho (não apaga arquivo fora de project-icons)", () => {
    expect(() => removeCustomIcon("../avatar")).toThrow(/Projeto inválido/);
    expect(resolveProjectIcon({ id: "../avatar", localPath: dir, iconMode: "custom" })).toBeNull();
  });
});
