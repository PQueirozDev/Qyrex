import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { AppSettings, NotificationPrefs } from "../../shared/types.js";

let db: Database.Database | null = null;

function migrationsDir(): string {
  // Em produção os .sql são copiados para dist-electron/main/database/migrations
  // pelo passo de build (scripts/copy-migrations.mjs).
  return path.join(__dirname, "migrations");
}

export function runMigrations(database: Database.Database, dir = migrationsDir()): string[] {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    database
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name)
  );

  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".sql"))
        .sort()
    : [];

  if (files.length === 0) {
    throw new Error(`Nenhuma migration encontrada em ${dir}`);
  }

  const applyOne = database.transaction((file: string, sql: string) => {
    database.exec(sql);
    database.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  });

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    applyOne(file, fs.readFileSync(path.join(dir, file), "utf-8"));
    newlyApplied.push(file);
  }
  return newlyApplied;
}

/** Abre (ou cria) um banco num caminho específico e aplica as migrations. */
export function openDatabase(file: string, dir?: string): Database.Database {
  const database = new Database(file);
  if (file !== ":memory:") database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  runMigrations(database, dir);
  return database;
}

export function getDb(): Database.Database {
  if (db) return db;
  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });
  db = openDatabase(path.join(userDataDir, "workspace.sqlite"));
  return db;
}

/** Usado pelos testes para injetar um banco em memória. */
export function setDbForTesting(database: Database.Database | null): void {
  db = database;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

// --- Settings -------------------------------------------------------------

interface SettingsRow {
  user_name: string;
  theme: string;
  start_with_system: number;
  minimize_to_tray: number;
  allowed_project_dirs: string;
  default_terminal: string;
  ai_default_provider: string | null;
  ai_default_model: string | null;
  notifications: string;
  onboarding_completed: number;
  vscode_path: string | null;
}

const DEFAULT_NOTIFICATIONS: NotificationPrefs = { tasks: true, events: true, billing: true, marketing: true };

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getSettings(): AppSettings {
  const row = getDb().prepare("SELECT * FROM user_settings WHERE id = 1").get() as SettingsRow;

  return {
    userName: row.user_name,
    theme: row.theme as AppSettings["theme"],
    startWithSystem: Boolean(row.start_with_system),
    minimizeToTray: Boolean(row.minimize_to_tray),
    allowedProjectDirs: parseJson<string[]>(row.allowed_project_dirs, []),
    defaultTerminal: row.default_terminal as AppSettings["defaultTerminal"],
    aiDefaultProvider: row.ai_default_provider as AppSettings["aiDefaultProvider"],
    aiDefaultModel: row.ai_default_model,
    notifications: { ...DEFAULT_NOTIFICATIONS, ...parseJson<Partial<NotificationPrefs>>(row.notifications, {}) },
    onboardingCompleted: Boolean(row.onboarding_completed),
    vscodePath: row.vscode_path,
  };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = { ...getSettings(), ...partial };

  getDb()
    .prepare(
      `UPDATE user_settings SET
        user_name = ?, theme = ?, start_with_system = ?, minimize_to_tray = ?,
        allowed_project_dirs = ?, default_terminal = ?,
        ai_default_provider = ?, ai_default_model = ?,
        notifications = ?, onboarding_completed = ?, vscode_path = ?
       WHERE id = 1`
    )
    .run(
      merged.userName,
      merged.theme,
      merged.startWithSystem ? 1 : 0,
      merged.minimizeToTray ? 1 : 0,
      JSON.stringify(merged.allowedProjectDirs),
      merged.defaultTerminal,
      merged.aiDefaultProvider,
      merged.aiDefaultModel,
      JSON.stringify(merged.notifications),
      merged.onboardingCompleted ? 1 : 0,
      merged.vscodePath
    );

  return merged;
}
