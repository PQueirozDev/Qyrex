import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as plugins from "../../src/main/services/pluginService";
import { listProjects } from "../../src/main/services/projectService";
import { listTasks } from "../../src/main/services/taskService";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

const manifest = (extra: object = {}) =>
  JSON.stringify({
    id: "exemplo.links",
    name: "Links do time",
    version: "1.0.0",
    author: "Exemplo",
    permissions: ["quickLinks"],
    contributes: { quickLinks: [{ title: "Docs", url: "https://example.com/docs" }] },
    ...extra,
  });

let dir: string;
beforeEach(() => {
  freshDb();
  dir = tempAllowedDir("pqw-plugins-");
});
afterEach(() => removeDir(dir));

describe("plugins: manifesto", () => {
  it("aceita um manifesto válido", () => {
    expect(plugins.parseManifest(manifest()).contributes.quickLinks?.[0].title).toBe("Docs");
  });

  it("recusa contribuição sem a permissão, campo desconhecido (ex.: código) e link perigoso", () => {
    expect(() => plugins.parseManifest(manifest({ permissions: [] }))).toThrow(/permissão/);
    expect(() => plugins.parseManifest(manifest({ main: "index.js" }))).toThrow();
    expect(() => plugins.parseManifest(manifest({ contributes: { scripts: ["rm -rf"] } }))).toThrow();
    expect(() => plugins.parseManifest(manifest({ contributes: { quickLinks: [{ title: "x", url: "file:///C:/Windows" }] } }))).toThrow();
    expect(() => plugins.parseManifest("{ não é json")).toThrow(/JSON/);
  });

  it("recusa modelo que tenta escrever fora da pasta do projeto", () => {
    const bad = (p: string) =>
      manifest({
        permissions: ["projectTemplates"],
        contributes: { projectTemplates: [{ id: "x1", name: "X", folders: [], files: [{ path: p, content: "" }], tasks: [] }] },
      });
    for (const p of ["../fora.txt", "C:\\Windows\\x.txt", "/etc/passwd", "a/../../b", "con<>.txt"]) {
      expect(() => plugins.parseManifest(bad(p)), p).toThrow();
    }
  });
});

describe("plugins: instalar, ligar e remover", () => {
  it("instala, atualiza só para versão igual ou mais nova, liga/desliga e remove", () => {
    const { updated } = plugins.installManifest(manifest());
    expect(updated).toBe(false);
    expect(plugins.listQuickLinks().some((l) => l.pluginId === "exemplo.links")).toBe(true);
    expect(plugins.installManifest(manifest({ version: "1.1.0" })).updated).toBe(true);
    expect(() => plugins.installManifest(manifest({ version: "1.0.5" }))).toThrow(/mais nova/);
    plugins.setEnabled("exemplo.links", false);
    expect(plugins.listQuickLinks().some((l) => l.pluginId === "exemplo.links")).toBe(false);
    plugins.uninstall("exemplo.links");
    expect(plugins.listPlugins().some((p) => p.manifest.id === "exemplo.links")).toBe(false);
  });

  it("não deixa sobrescrever nem remover um embutido; desligar o embutido tira a capacidade", () => {
    expect(() => plugins.installManifest(manifest({ id: "qyrex.quick-links" }))).toThrow(/embutido/);
    expect(() => plugins.uninstall("qyrex.quick-links")).toThrow();
    expect(plugins.isPermissionActive("notes")).toBe(true);
    plugins.setEnabled("qyrex.project-notes", false);
    expect(plugins.isPermissionActive("notes")).toBe(false);
  });

  it("recusa plugin que pede um Qyrex mais novo", () => {
    expect(() => plugins.installManifest(manifest({ qyrex: "99.0.0" }))).toThrow(/mais novo/);
  });
});

describe("plugins: links e modelos", () => {
  it("links do usuário só http(s)", () => {
    const l = plugins.addQuickLink({ title: "Board", url: "https://example.com/board" });
    expect(plugins.listQuickLinks().map((x) => x.id)).toContain(l.id);
    expect(() => plugins.addQuickLink({ title: "x", url: "javascript:alert(1)" })).toThrow();
    plugins.removeQuickLink(l.id);
    expect(plugins.listQuickLinks().some((x) => x.id === l.id)).toBe(false);
  });

  it("cria projeto pelo modelo: pastas, arquivos, cadastro e tarefas; nunca sobrescreve", () => {
    const project = plugins.createFromTemplate({ pluginId: "qyrex.project-templates", templateId: "api-node", parentDir: dir, name: "minha-api" });
    const root = path.join(dir, "minha-api");
    expect(fs.existsSync(path.join(root, "src", "routes"))).toBe(true);
    expect(fs.readFileSync(path.join(root, "README.md"), "utf-8")).toContain("# minha-api");
    expect(listProjects().some((p) => p.id === project.id)).toBe(true);
    expect(listTasks().filter((t) => t.projectId === project.id).length).toBeGreaterThan(0);
    expect(() => plugins.createFromTemplate({ pluginId: "qyrex.project-templates", templateId: "api-node", parentDir: dir, name: "minha-api" })).toThrow(/Já existe/);
  });
});
