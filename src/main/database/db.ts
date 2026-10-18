import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { AppSettings, BackupPrefs, DiscordPrefs, NotificationPrefs } from "../../shared/types.js";

let db: Database.Database | null = null;

export const DB_FILE_NAME = "workspace.sqlite";

/**
 * Chamado com o banco já aberto quando há migrations pendentes num banco que já
 * tinha dados (atualização do app). O index.ts liga aqui o backup automático
 * "antes de atualizar o banco", para dar como voltar atrás.
 */
type BeforeMigrateHook = (database: Database.Database, pending: string[]) => void;
let beforeMigrateHook: BeforeMigrateHook | null = null;

export function setBeforeMigrateHook(hook: BeforeMigrateHook | null): void {
  beforeMigrateHook = hook;
}

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

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length > 0 && applied.size > 0 && beforeMigrateHook) beforeMigrateHook(database, pending);

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

/** Caminho do banco do app em `<userData>`. */
export function databaseFile(): string {
  return path.join(app.getPath("userData"), DB_FILE_NAME);
}

let opening = false;

export function getDb(): Database.Database {
  if (db) return db;
  // O gancho de antes das migrations roda com o banco ainda abrindo: quem chamar
  // getDb() nesse meio (ex.: tradução de erro) recebe um erro, não uma recursão.
  if (opening) throw new Error("O banco de dados ainda está abrindo.");
  opening = true;
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    db = openDatabase(databaseFile());
  } finally {
    opening = false;
  }
  return db;
}

/**
 * Troca o banco do app por uma cópia (restauração de backup). A cópia vai
 * primeiro para um arquivo ao lado e só substitui o banco depois de abrir sem
 * erro; a conexão atual é fechada (o que já grava o WAL no arquivo) e a nova
 * aplica as migrations que faltarem, trazendo um backup antigo para o esquema atual.
 */
export function replaceDatabaseFile(source: string): void {
  const target = databaseFile();
  const staging = `${target}.restoring`;
  fs.copyFileSync(source, staging);
  try {
    new Database(staging, { fileMustExist: true }).close();
  } catch (err) {
    fs.rmSync(staging, { force: true });
    throw err;
  }
  closeDb();
  for (const suffix of ["-wal", "-shm"]) fs.rmSync(`${target}${suffix}`, { force: true });
  fs.renameSync(staging, target);
  getDb();
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
  language: string;
  discord: string;
  auto_update: number;
  last_seen_version: string | null;
  splash_animation: number;
  allow_all_dirs: number;
  business_mode: number;
  backup: string;
}

const DEFAULT_DISCORD: DiscordPrefs = { enabled: false, clientId: null, showProject: false };
export const DEFAULT_BACKUP: BackupPrefs = { auto: true, intervalDays: 1, keep: 10 };
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
    allowAllDirs: Boolean(row.allow_all_dirs),
    defaultTerminal: row.default_terminal as AppSettings["defaultTerminal"],
    aiDefaultProvider: row.ai_default_provider as AppSettings["aiDefaultProvider"],
    aiDefaultModel: row.ai_default_model,
    notifications: { ...DEFAULT_NOTIFICATIONS, ...parseJson<Partial<NotificationPrefs>>(row.notifications, {}) },
    onboardingCompleted: Boolean(row.onboarding_completed),
    vscodePath: row.vscode_path,
    language: row.language === "en" ? "en" : "pt",
    discord: { ...DEFAULT_DISCORD, ...parseJson<Partial<DiscordPrefs>>(row.discord, {}) },
    autoUpdate: Boolean(row.auto_update),
    lastSeenVersion: row.last_seen_version,
    splashAnimation: Boolean(row.splash_animation),
    businessMode: Boolean(row.business_mode),
    backup: { ...DEFAULT_BACKUP, ...parseJson<Partial<BackupPrefs>>(row.backup, {}) },
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
        notifications = ?, onboarding_completed = ?, vscode_path = ?,
        language = ?, discord = ?, auto_update = ?, last_seen_version = ?,
        splash_animation = ?, allow_all_dirs = ?, business_mode = ?, backup = ?
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
      merged.vscodePath,
      merged.language,
      JSON.stringify(merged.discord),
      merged.autoUpdate ? 1 : 0,
      merged.lastSeenVersion,
      merged.splashAnimation ? 1 : 0,
      merged.allowAllDirs ? 1 : 0,
      merged.businessMode ? 1 : 0,
      JSON.stringify(merged.backup)
    );

  return merged;
}
