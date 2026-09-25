import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ipcMain } from "electron";
import { registerIpcHandlers, setDevServerUrl } from "../../src/main/ipc/handlers";
import { freshDb, removeDir, tempAllowedDir } from "../helpers";

type Invoke = (event: unknown, ...args: unknown[]) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
const handlers = new Map<string, Invoke>();

const trusted = { senderFrame: { url: "file:///C:/app/dist/renderer/index.html" }, sender: { isDestroyed: () => false, send: () => undefined } };
const untrusted = { senderFrame: { url: "https://evil.example/" }, sender: trusted.sender };

function call(channel: string, ...args: unknown[]) {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`canal não registrado: ${channel}`);
  return fn(trusted, ...args);
}

beforeAll(() => {
  (ipcMain.handle as unknown as { mockImplementation: (f: (c: string, h: Invoke) => void) => void }).mockImplementation(
    (channel, handler) => handlers.set(channel, handler)
  );
  setDevServerUrl(null);
  registerIpcHandlers();
});

let dir: string;
beforeEach(() => {
  freshDb();
  dir = tempAllowedDir();
});
afterEach(() => removeDir(dir));

describe("IPC", () => {
  it("rejeita chamadas de origens não confiáveis", async () => {
    const res = await handlers.get("settings:get")!(untrusted);
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/não autorizada/) });
  });

  it("nunca lança exceção: sempre devolve IpcResult", async () => {
    const res = await call("tasks:update", "nao-existe", { title: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/não encontrada/);
  });

  it("valida o formato das entradas", async () => {
    expect((await call("tasks:create", { title: "" })).ok).toBe(false);
    expect((await call("tasks:create", { title: "ok", priority: "altíssima" })).ok).toBe(false);
    expect((await call("tasks:create", { title: "ok", dueDate: "10/10/2030" })).ok).toBe(false);
    expect((await call("tasks:create", null)).ok).toBe(false);
    expect((await call("tasks:create", { title: "ok", dueDate: "2030-10-10", dueTime: "09:30" })).ok).toBe(true);
    expect((await call("clients:create", { name: "X", email: "não-é-email" })).ok).toBe(false);
    expect((await call("settings:update", { theme: "neon" })).ok).toBe(false);
  });

  it("descarta campos desconhecidos (mass assignment)", async () => {
    const res = await call("settings:update", { userName: "Pedro", allowedProjectDirs: ["C:\\"], vscodePath: "C:\\evil.exe" });
    expect(res.ok).toBe(true);
    const settings = (await call("settings:get")).data as { allowedProjectDirs: string[]; vscodePath: string | null };
    expect(settings.allowedProjectDirs).toEqual([dir]);
    expect(settings.vscodePath).toBeNull();
  });

  it("não autoriza a raiz do disco como diretório", async () => {
    const res = await call("settings:addAllowedDir", path.parse(dir).root);
    expect(res.ok).toBe(false);
  });

  it("exclusão de arquivo exige confirmação explícita", async () => {
    const file = path.join(dir, "apagar.txt");
    fs.writeFileSync(file, "x");
    expect((await call("files:delete", file)).ok).toBe(false);
    expect((await call("files:delete", file, "true")).ok).toBe(false);
    expect(fs.existsSync(file)).toBe(true);
    expect((await call("files:delete", file, true)).ok).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("mover e operações git exigem confirmação", async () => {
    fs.mkdirSync(path.join(dir, "a"));
    fs.mkdirSync(path.join(dir, "b"));
    expect((await call("files:move", path.join(dir, "a"), path.join(dir, "b"), false)).ok).toBe(false);
    expect((await call("git:push", { projectPath: dir })).ok).toBe(false);
    expect((await call("git:commit", { projectPath: dir, message: "x", stageAll: true, confirmed: false })).ok).toBe(false);
  });

  it("path traversal via IPC é bloqueado", async () => {
    const res = await call("files:list", path.join(dir, "..", ".."));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Acesso negado/);
  });

  it("AI Council exige que a quantidade confirmada bata com os alvos", async () => {
    const res = await call("ai:council:run", {
      prompt: "oi",
      targets: [
        { provider: "anthropic", model: "claude-opus-5", requestId: "r1" },
        { provider: "openai", model: "gpt-5", requestId: "r2" },
      ],
      confirmedCount: 1,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/não confere/);
  });

  it("uso da IA: resumo valida o período e apagar exige confirmação", async () => {
    expect((await call("ai:usage:summary", 7)).ok).toBe(true);
    expect((await call("ai:usage:summary", null)).ok).toBe(true);
    expect((await call("ai:usage:summary", -5)).ok).toBe(false);
    expect((await call("ai:usage:summary", "30")).ok).toBe(false);
    expect((await call("ai:usage:clear")).ok).toBe(false);
    expect((await call("ai:usage:clear", true)).ok).toBe(true);
  });

  it("comandos da IA exigem confirmação literal true", async () => {
    const res = await call("commands:run", { command: "git status", cwd: dir, decision: "once", confirmed: "yes" });
    expect(res.ok).toBe(false);
  });

  it("URLs externas perigosas são recusadas", async () => {
    expect((await call("system:openExternalUrl", "file:///C:/Windows/System32/calc.exe")).ok).toBe(false);
    expect((await call("system:openExternalUrl", "https://github.com")).ok).toBe(true);
  });
});
