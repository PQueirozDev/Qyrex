import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, getSettings, updateSettings } from "../../src/main/database/db";
import * as sync from "../../src/main/services/syncService";
import { listBackups } from "../../src/main/services/backupService";
import { createTask, listTasks } from "../../src/main/services/taskService";
import { addActiveSeconds } from "../../src/main/services/appUsageService";

/**
 * Dois "PCs" no mesmo processo: o banco e o sync.json de cada um ficam guardados
 * numa pasta e são trocados com `asPC`. A pasta de sincronização é comum.
 */
const userData = app.getPath("userData");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "pqw-sync-"));
const cloud = path.join(work, "OneDrive");
const store = path.join(work, "pcs");
let current: string | null = null;
const FILES = ["workspace.sqlite", "sync.json"];

function asPC(name: string): void {
  closeDb();
  if (current) {
    fs.mkdirSync(path.join(store, current), { recursive: true });
    for (const f of FILES) if (fs.existsSync(path.join(userData, f))) fs.copyFileSync(path.join(userData, f), path.join(store, current, f));
  }
  for (const f of [...FILES, "workspace.sqlite-wal", "workspace.sqlite-shm"]) fs.rmSync(path.join(userData, f), { force: true });
  for (const f of FILES) if (fs.existsSync(path.join(store, name, f))) fs.copyFileSync(path.join(store, name, f), path.join(userData, f));
  current = name;
  getDb();
}

const titles = () => listTasks().map((t) => t.title).sort();

beforeAll(() => {
  fs.mkdirSync(cloud, { recursive: true });
  fs.rmSync(path.join(userData, "backups"), { recursive: true, force: true });
});

afterAll(() => {
  closeDb();
  for (const f of [...FILES, "workspace.sqlite-wal", "workspace.sqlite-shm"]) fs.rmSync(path.join(userData, f), { force: true });
  fs.rmSync(work, { recursive: true, force: true });
});

describe("sincronização entre PCs", () => {
  it("cifra e decifra; senha errada é recusada", () => {
    const sealed = sync.encrypt(Buffer.from("dados"), "senha-forte-1");
    expect(sealed.toString("utf8")).not.toContain("dados");
    expect(sync.decrypt(sealed, "senha-forte-1").toString()).toBe("dados");
    expect(() => sync.decrypt(sealed, "outra-senha")).toThrow(/incorreta/);
  });

  it("fluxo completo entre dois PCs: enviar, conflito na entrada, receber e manter o que é de cada PC", () => {
    // PC A configura e envia.
    asPC("A");
    updateSettings({ allowedProjectDirs: ["C:\\Projetos-A"] });
    getDb().prepare("INSERT INTO integrations (id, provider, metadata) VALUES ('github', 'github', '{\"login\":\"pc-a\"}')").run();
    createTask({ title: "A1" });
    sync.setFolder(cloud);
    sync.setPassphrase("senha-forte-1");
    sync.setDeviceName("PC A");
    expect(sync.getStatus().state).toBe("remote-empty");
    expect(sync.syncNow().state).toBe("in-sync");

    // A cópia na nuvem não leva nada que seja do PC A.
    const manifest = JSON.parse(fs.readFileSync(path.join(cloud, "Qyrex-sync", "latest.json"), "utf-8"));
    const snap = path.join(work, "snap.sqlite");
    fs.writeFileSync(snap, sync.decrypt(fs.readFileSync(path.join(cloud, "Qyrex-sync", "snapshots", `${manifest.revision}.qyx`)), "senha-forte-1"));
    const copy = new Database(snap, { readonly: true });
    expect(copy.prepare("SELECT COUNT(*) AS n FROM integrations").get()).toEqual({ n: 0 });
    expect(copy.prepare("SELECT allowed_project_dirs AS d FROM user_settings").get()).toEqual({ d: "[]" });
    copy.close();
    expect(fs.readFileSync(path.join(cloud, "Qyrex-sync", "snapshots", `${manifest.revision}.qyx`)).includes(Buffer.from("CREATE TABLE"))).toBe(false);

    // PC B já tem dados próprios: entrar é um conflito, e nada muda sem escolha.
    asPC("B");
    updateSettings({ allowedProjectDirs: ["D:\\Code-B"] });
    createTask({ title: "B-antes" });
    sync.setFolder(cloud);
    sync.setDeviceName("PC B");
    expect(sync.getStatus().state).toBe("conflict");
    expect(sync.syncNow().state).toBe("conflict");
    expect(titles()).toEqual(["B-antes"]);

    // B escolhe usar a da nuvem: recebe, guarda backup do que tinha e mantém as pastas dele.
    expect(sync.syncNow("pull").state).toBe("in-sync");
    expect(titles()).toEqual(["A1"]);
    expect(getSettings().allowedProjectDirs).toEqual(["D:\\Code-B"]);
    expect(listBackups().some((b) => b.kind === "pre-sync")).toBe(true);

    // B cria e envia; A recebe sem conflito (A não mudou nada).
    createTask({ title: "B1" });
    expect(sync.getStatus().state).toBe("push");
    sync.syncNow();
    asPC("A");
    expect(sync.getStatus().state).toBe("pull");
    expect(sync.getStatus().remote?.deviceName).toBe("PC B");
    sync.syncNow("pull");
    expect(titles()).toEqual(["A1", "B1"]);
    expect(getSettings().allowedProjectDirs).toEqual(["C:\\Projetos-A"]);
    expect(getDb().prepare("SELECT metadata FROM integrations WHERE id = 'github'").get()).toEqual({ metadata: '{"login":"pc-a"}' });

    // Os dois mudam: quem chega depois vê conflito e pode manter o seu.
    createTask({ title: "A2" });
    asPC("B");
    createTask({ title: "B2" });
    sync.syncNow();
    asPC("A");
    expect(sync.getStatus().state).toBe("conflict");
    const before = fs.readdirSync(path.join(cloud, "Qyrex-sync", "snapshots")).length;
    expect(sync.syncNow("push").state).toBe("in-sync");
    // A versão do B não some: a cópia anterior continua na pasta.
    expect(fs.readdirSync(path.join(cloud, "Qyrex-sync", "snapshots")).length).toBe(before + 1);
    expect(titles()).toEqual(["A1", "A2", "B1"]);
  });

  it("tempo de uso do app não conta como mudança para sincronizar", () => {
    asPC("A");
    expect(sync.getStatus().state).toBe("in-sync");
    addActiveSeconds(120);
    expect(sync.getStatus().state).toBe("in-sync");
  });

  it("senha errada, versão mais nova na nuvem e cópia incompleta são recusadas sem mexer nos dados", () => {
    asPC("B");
    sync.setPassphrase("senha-errada-123");
    expect(sync.getStatus().state).toBe("pull");
    expect(() => sync.syncNow("pull")).toThrow(/incorreta/);
    expect(titles()).toEqual(["A1", "B1", "B2"]);
    sync.setPassphrase("senha-forte-1");

    const manifestFile = path.join(cloud, "Qyrex-sync", "latest.json");
    const original = fs.readFileSync(manifestFile, "utf-8");
    fs.writeFileSync(manifestFile, JSON.stringify({ ...JSON.parse(original), sha256: "0".repeat(64) }));
    expect(() => sync.syncNow("pull")).toThrow(/ainda está chegando/);
    fs.writeFileSync(manifestFile, JSON.stringify({ ...JSON.parse(original), migrations: ["999_futuro.sql"] }));
    expect(sync.getStatus().state).toBe("remote-newer-app");
    expect(() => sync.syncNow()).toThrow(/versão mais nova/);
    fs.writeFileSync(manifestFile, original);
  });

  it("a pasta não pode ficar dentro dos dados do Qyrex e desligar esquece pasta e senha", () => {
    asPC("A");
    expect(() => sync.setFolder(path.join(userData, "x"))).toThrow();
    const st = sync.disconnect();
    expect(st.state).toBe("not-configured");
    expect(st.hasPassphrase).toBe(false);
    expect(fs.existsSync(path.join(cloud, "Qyrex-sync", "latest.json"))).toBe(true);
  });
});
