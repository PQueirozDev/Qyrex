import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as runner from "../../src/main/services/runnerService";
import { createProject } from "../../src/main/services/projectService";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

let dir: string;
let projectId: string;

beforeEach(() => {
  freshDb();
  dir = tempAllowedDir("pqw-runner-");
  fs.mkdirSync(path.join(dir, "app"));
  projectId = createProject({ name: "App", localPath: path.join(dir, "app") }).id;
});

afterEach(() => {
  runner.stopAll();
  removeDir(dir);
});

describe("runner: scripts do projeto", () => {
  it("lê os scripts na ordem do package.json e detecta o gerenciador pelo lockfile", () => {
    const app = path.join(dir, "app");
    fs.writeFileSync(path.join(app, "package.json"), JSON.stringify({ scripts: { dev: "vite", test: "vitest", bad: 42 } }));
    expect(runner.getProjectScripts(projectId)).toEqual({
      packageManager: "npm",
      scripts: [
        { name: "dev", command: "vite" },
        { name: "test", command: "vitest" },
      ],
    });
    fs.writeFileSync(path.join(app, "pnpm-lock.yaml"), "");
    expect(runner.getProjectScripts(projectId).packageManager).toBe("pnpm");
  });

  it("sem package.json não quebra", () => {
    expect(runner.getProjectScripts(projectId).scripts).toEqual([]);
  });

  it("recusa script que não existe no package.json (o nome nunca vira comando livre)", () => {
    fs.writeFileSync(path.join(dir, "app", "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    expect(() => runner.start({ projectId, script: "dev; Remove-Item -Recurse C:\\" })).toThrow(/Script não encontrado/);
    expect(() => runner.start({ projectId, script: "constructor" })).toThrow(/Script não encontrado/);
    expect(() => runner.start({ projectId })).toThrow();
    expect(runner.listProcesses()).toEqual([]);
  });
});

describe("runner: saída e portas", () => {
  it("acha URLs locais na saída (com cores ANSI) e troca 0.0.0.0 por localhost", () => {
    const out = "  \u001b[32m➜\u001b[0m  Local:   \u001b[36mhttp://localhost:5173/\u001b[0m\n  Network: http://0.0.0.0:3000.";
    expect(runner.extractLocalUrls(out)).toEqual(["http://localhost:5173/", "http://localhost:3000"]);
    expect(runner.extractLocalUrls("https://example.com e http://192.168.0.2:80")).toEqual([]);
    expect(runner.extractLocalUrls("http://localhost:5173/", ["http://localhost:5173/"])).toEqual(["http://localhost:5173/"]);
  });

  it("netstat: reconhece escuta pelo endereço remoto (o estado vem traduzido) e ignora conexões", () => {
    const raw = [
      "Conexões ativas",
      "  Proto  Endereço local          Endereço externo       Estado           PID",
      "  TCP    0.0.0.0:5173           0.0.0.0:0              ESCUTANDO        1234",
      "  TCP    127.0.0.1:5173         127.0.0.1:51000        ESTABELECIDA     1234",
      "  TCP    [::]:3000              [::]:0                 LISTENING        999",
      "  TCP    [::]:3000              [::]:0                 LISTENING        999",
      "  UDP    0.0.0.0:5353           *:*                                     77",
    ].join("\r\n");
    expect(runner.parseNetstat(raw)).toEqual([
      { port: 3000, address: "[::]", pid: 999 },
      { port: 5173, address: "0.0.0.0", pid: 1234 },
    ]);
  });

  it("tasklist CSV → nome por PID", () => {
    const names = runner.parseTasklist('"node.exe","1234","Console","1","50.000 K"\r\n"Code.exe","99","Console","1","1 K"');
    expect(names.get(1234)).toBe("node.exe");
    expect(names.get(99)).toBe("Code.exe");
  });
});
