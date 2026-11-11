import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/main/database/db";
import { MIGRATIONS_DIR, removeDir } from "../helpers";

// Qyrex 100% para devs: a 018 apaga clientes e marketing de quem já usava o app,
// sem perder projetos, tarefas nem o que depende deles.

let tmp: string | null = null;
afterEach(() => {
  if (tmp) removeDir(tmp);
  tmp = null;
});

/** Banco no esquema da 017 (antes da 018), com dados de negócio e de dev ligados entre si. */
function legacyDb(): Database.Database {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qyrex-018-"));
  for (const f of fs.readdirSync(MIGRATIONS_DIR)) if (f < "018") fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(tmp, f));
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db, tmp);
  db.exec(`
    INSERT INTO clients (id, name, status, monthly_value) VALUES ('c1', 'Café Aurora', 'ativo', 450);
    INSERT INTO projects (id, name, local_path, client_id, favorite, status) VALUES ('p1', 'api', 'C:\\Projetos\\api', 'c1', 1, 'pausado');
    INSERT INTO tasks (id, title, project_id, client_id, due_date, tags) VALUES ('t1', 'Webhooks', 'p1', 'c1', '2030-01-10', '["backend"]');
    INSERT INTO tasks (id, title, client_id) VALUES ('t2', 'Orçamento', 'c1');
    INSERT INTO marketing_content (id, client_id, type, title) VALUES ('m1', 'c1', 'post', 'Post');
    INSERT INTO automations (id, project_id, name, steps) VALUES ('a1', 'p1', 'verificar', '[]');
    INSERT INTO focus_sessions (id, project_id, task_id, planned_minutes, started_at, status)
      VALUES ('f1', 'p1', 't1', 25, '2030-01-10T10:00:00Z', 'concluida');
    INSERT INTO recent_items (id, item_type, item_id, label) VALUES ('r1', 'client', 'c1', 'Café Aurora'), ('r2', 'project', 'p1', 'api');
    UPDATE user_settings SET business_mode = 1, notifications = '{"tasks":false,"events":true,"billing":true,"marketing":true}';
  `);
  return db;
}

describe("migration 018 (100% para devs)", () => {
  it("apaga clientes e marketing e preserva projetos, tarefas e dependentes", () => {
    const db = legacyDb();
    expect(runMigrations(db, MIGRATIONS_DIR)).toEqual(["018_dev_only.sql"]);

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    expect(tables).not.toContain("clients");
    expect(tables).not.toContain("marketing_content");
    expect(tables).not.toContain("projects_new");

    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(cols("projects")).not.toContain("client_id");
    expect(cols("tasks")).not.toContain("client_id");
    expect(cols("user_settings")).not.toContain("business_mode");

    expect(db.prepare("SELECT name, favorite, status FROM projects").get()).toEqual({ name: "api", favorite: 1, status: "pausado" });
    expect(db.prepare("SELECT id, project_id FROM tasks ORDER BY id").all()).toEqual([
      { id: "t1", project_id: "p1" },
      { id: "t2", project_id: null },
    ]);
    // Reconstruir projects não pode disparar o ON DELETE CASCADE das automações nem o SET NULL do foco.
    expect(db.prepare("SELECT project_id FROM automations").get()).toEqual({ project_id: "p1" });
    expect(db.prepare("SELECT project_id, task_id FROM focus_sessions").get()).toEqual({ project_id: "p1", task_id: "t1" });
    expect(db.prepare("SELECT item_type FROM recent_items").all()).toEqual([{ item_type: "project" }]);
    expect(JSON.parse((db.prepare("SELECT notifications FROM user_settings").get() as { notifications: string }).notifications)).toEqual({ tasks: false, events: true });

    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    // As chaves estrangeiras continuam valendo depois da migration.
    expect(() => db.prepare("INSERT INTO tasks (id, title, project_id) VALUES ('t3', 'x', 'nao-existe')").run()).toThrow(/FOREIGN KEY/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name IN ('idx_tasks_status', 'idx_tasks_project')").get()).toEqual({ n: 2 });
  });
});
