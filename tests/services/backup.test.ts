import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, getSettings, openDatabase, runMigrations, setBeforeMigrateHook, updateSettings } from "../../src/main/database/db";
import {
  backupsDir,
  buildSettingsExport,
  createBackup,
  deleteBackup,
  listBackups,
  parseSettingsExport,
  restoreBackup,
  runAutoBackupIfDue,
  verifyBackup,
  writeBackup,
} from "../../src/main/services/backupService";
import { createTask, listTasks } from "../../src/main/services/taskService";
import { freshDb, MIGRATIONS_DIR, removeDir } from "../helpers";

const userData = app.getPath("userData");

beforeEach(() => {
  closeDb();
  removeDir(backupsDir());
  for (const f of ["workspace.sqlite", "workspace.sqlite-wal", "workspace.sqlite-shm", "avatar.png"]) fs.rmSync(path.join(userData, f), { force: true });
  freshDb();
});

afterAll(() => {
  closeDb();
  removeDir(backupsDir());
});

describe("backup local", () => {
  it("cria um backup válido, com manifesto e hash", () => {
    createTask({ title: "Tarefa antes do backup" });
    const info = createBackup("manual");
    expect(info.valid).toBe(true);
    expect(info.migrations).toContain("001_init.sql");
    expect(info.sha256).toMatch(/^[0-9a-f]{64}$/);
    const dir = path.join(backupsDir(), info.id);
    expect(fs.existsSync(path.join(dir, "workspace.sqlite"))).toBe(true);
    // Um arquivo só: sem -wal/-shm ao lado da cópia.
    expect(fs.readdirSync(dir).filter((f) => f.includes("-wal") || f.includes("-shm"))).toEqual([]);
    expect(listBackups().map((b) => b.id)).toEqual([info.id]);
    expect(verifyBackup(info.id).valid).toBe(true);
  });

  it("detecta backup adulterado ou incompleto", () => {
    const info = createBackup("manual");
    const dbFile = path.join(backupsDir(), info.id, "workspace.sqlite");
    const bytes = fs.readFileSync(dbFile);
    bytes[bytes.length - 10] ^= 0xff;
    fs.writeFileSync(dbFile, bytes);
    expect(verifyBackup(info.id).valid).toBe(false);

    fs.rmSync(dbFile);
    const listed = listBackups().find((b) => b.id === info.id);
    expect(listed?.valid).toBe(false);
    expect(listed?.problem).toBeTruthy();
  });

  it("pasta sem manifesto aparece como inválida, e ids fora da pasta são recusados", () => {
    fs.mkdirSync(path.join(backupsDir(), "lixo"), { recursive: true });
    expect(listBackups().find((b) => b.id === "lixo")?.valid).toBe(false);
    expect(() => verifyBackup("../workspace")).toThrow();
    expect(() => deleteBackup("..")).toThrow();
  });

  it("restaura os dados do backup e guarda o estado anterior", () => {
    createTask({ title: "Original" });
    const backup = createBackup("manual");
    createTask({ title: "Criada depois do backup" });
    expect(listTasks()).toHaveLength(2);

    const { safety } = restoreBackup(backup.id);
    expect(listTasks().map((t) => t.title)).toEqual(["Original"]);
    // O banco restaurado continua com todas as migrations atuais.
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM _migrations").get()).toEqual({ n: fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).length });

    // O backup de segurança tem o estado de antes da restauração: dá para desfazer.
    expect(safety.kind).toBe("pre-restore");
    restoreBackup(safety.id);
    expect(listTasks()).toHaveLength(2);
  });

  it("restaura também a foto de perfil", () => {
    fs.writeFileSync(path.join(userData, "avatar.png"), "foto-antiga");
    const backup = createBackup("manual");
    expect(backup.extraFiles).toBe(1);
    fs.writeFileSync(path.join(userData, "avatar.png"), "foto-nova");
    restoreBackup(backup.id);
    expect(fs.readFileSync(path.join(userData, "avatar.png"), "utf-8")).toBe("foto-antiga");
  });

  it("recusa restaurar backup de uma versão mais nova do app", () => {
    getDb().prepare("INSERT INTO _migrations (name) VALUES ('999_futuro.sql')").run();
    const backup = createBackup("manual");
    getDb().prepare("DELETE FROM _migrations WHERE name = '999_futuro.sql'").run();
    expect(() => restoreBackup(backup.id)).toThrow(/versão mais nova/);
  });

  it("automático respeita o intervalo e só apaga os antigos depois do novo", () => {
    updateSettings({ backup: { auto: true, intervalDays: 1, keep: 2 } });
    const first = runAutoBackupIfDue();
    expect(first?.kind).toBe("auto");
    expect(runAutoBackupIfDue()).toBeNull(); // ainda dentro do intervalo
    runAutoBackupIfDue(Date.now() + 2 * 86_400_000);
    runAutoBackupIfDue(Date.now() + 4 * 86_400_000);
    const autos = listBackups().filter((b) => b.kind === "auto");
    expect(autos).toHaveLength(2);

    const manual = createBackup("manual");
    runAutoBackupIfDue(Date.now() + 6 * 86_400_000);
    expect(listBackups().some((b) => b.id === manual.id)).toBe(true);

    updateSettings({ backup: { auto: false, intervalDays: 1, keep: 2 } });
    expect(runAutoBackupIfDue(Date.now() + 30 * 86_400_000)).toBeNull();
  });

  it("faz backup antes de migrar um banco que já tinha dados", () => {
    const file = path.join(userData, "migrar.sqlite");
    fs.rmSync(file, { force: true });
    // Banco "antigo": só as 3 primeiras migrations.
    const partial = fs.mkdtempSync(path.join(userData, "mig-"));
    for (const f of fs.readdirSync(MIGRATIONS_DIR).sort().slice(0, 3)) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(partial, f));
    openDatabase(file, partial).close();

    const seen: string[][] = [];
    setBeforeMigrateHook((database, pending) => {
      seen.push(pending);
      writeBackup(database, "pre-migration");
    });
    try {
      const database = openDatabase(file, MIGRATIONS_DIR);
      database.close();
    } finally {
      setBeforeMigrateHook(null);
      removeDir(partial);
      fs.rmSync(file, { force: true });
    }
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBe(fs.readdirSync(MIGRATIONS_DIR).sort()[3]);
    const pre = listBackups().find((b) => b.kind === "pre-migration");
    expect(pre?.migrations).toHaveLength(3);
  });

  it("banco novo (sem dados) não dispara o backup de migração", () => {
    let called = false;
    setBeforeMigrateHook(() => {
      called = true;
    });
    try {
      runMigrations(openDatabase(":memory:", MIGRATIONS_DIR), MIGRATIONS_DIR);
    } finally {
      setBeforeMigrateHook(null);
    }
    expect(called).toBe(false);
  });
});

describe("exportar e importar configurações", () => {
  it("exporta só preferências portáveis e importa de volta", () => {
    updateSettings({ theme: "onsen", language: "en", allowedProjectDirs: ["C:\\segredo"], allowAllDirs: true });
    const raw = buildSettingsExport();
    expect(raw).not.toContain("segredo");
    expect(raw).not.toContain("allowAllDirs");

    const parsed = parseSettingsExport(raw, "x.json");
    expect(parsed.patch.theme).toBe("onsen");
    expect(parsed.patch.language).toBe("en");
    expect(parsed.patch).not.toHaveProperty("allowedProjectDirs");
    expect(getSettings().theme).toBe("onsen"); // ler não aplica nada
  });

  it("descarta chaves perigosas e recusa arquivos inválidos", () => {
    const evil = JSON.stringify({ format: "qyrex-settings", settings: { theme: "dark", allowAllDirs: true, allowedProjectDirs: ["C:\\"] } });
    const parsed = parseSettingsExport(evil, "x.json");
    expect(parsed.patch).toEqual({ theme: "dark" });

    expect(() => parseSettingsExport("não é json", "x.json")).toThrow();
    expect(() => parseSettingsExport(JSON.stringify({ format: "outra-coisa", settings: {} }), "x.json")).toThrow();
    expect(() => parseSettingsExport(JSON.stringify({ format: "qyrex-settings", settings: { theme: "neon" } }), "x.json")).toThrow();
  });
});
