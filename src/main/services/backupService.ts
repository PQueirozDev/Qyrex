import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import { DB_FILE_NAME, getDb, getSettings, replaceDatabaseFile } from "../database/db.js";
import { createLogger } from "../logger.js";
import { settingsPatch } from "../security/validation.js";
import { tt } from "../i18n.js";
import type { AppSettings, BackupInfo, BackupKind, SettingsImport } from "../../shared/types.js";

const log = createLogger("backup");

/**
 * Backups locais do Qyrex em `<userData>/backups/<id>/`:
 *   workspace.sqlite  cópia consistente do banco (VACUUM INTO, funciona com WAL)
 *   files/            foto de perfil e ícones personalizados dos projetos
 *   manifest.json     versão do app, migrations, tamanho e SHA-256 do banco
 *
 * Um backup só passa a existir (a pasta só ganha o nome final) depois que o
 * banco copiado abriu e passou no `integrity_check`. Backups antigos só são
 * apagados depois que o novo foi validado. Segredos (cofre do SO) nunca entram:
 * são cifrados para este usuário/PC e voltariam inúteis em outro lugar.
 */

const MANIFEST = "manifest.json";
const FILES_DIR = "files";
/** Arquivos do Qyrex em `<userData>` que vão junto com o banco. */
const EXTRA_ENTRIES = ["avatar.png", "project-icons"];
/** Quantos backups automáticos de segurança (antes de restaurar/atualizar) guardar. */
const KEEP_SAFETY = 5;

interface Manifest {
  format: "qyrex-backup";
  version: 1;
  kind: BackupKind;
  createdAt: string;
  appVersion: string;
  migrations: string[];
  sizeBytes: number;
  sha256: string;
  extraFiles: number;
}

export function backupsDir(): string {
  return path.join(app.getPath("userData"), "backups");
}

function backupPath(id: string): string {
  const root = backupsDir();
  const dir = path.resolve(root, id);
  // O id vem do renderer (validado por regex), mas a pasta precisa ficar dentro de backups/.
  if (path.dirname(dir) !== path.resolve(root)) throw new Error("Backup inválido.");
  return dir;
}

function sha256File(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function newId(kind: BackupKind, now = new Date()): string {
  const base = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}_${kind}`;
  let id = base;
  for (let i = 2; fs.existsSync(path.join(backupsDir(), id)); i++) id = `${base}-${i}`;
  return id;
}

/** Abre a cópia, confere integridade e lê as migrations. Lança se o arquivo não servir. */
function inspectDatabase(file: string): string[] {
  const copy = new Database(file, { fileMustExist: true });
  try {
    // A cópia fica num arquivo só (sem -wal/-shm), fácil de mover e restaurar.
    copy.pragma("journal_mode = DELETE");
    const result = copy.pragma("integrity_check", { simple: true });
    if (result !== "ok") throw new Error(tt("Banco corrompido: {detail}", { detail: String(result) }));
    const hasTable = copy.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_migrations'").get();
    if (!hasTable) throw new Error("O arquivo não é um banco do Qyrex.");
    return (copy.prepare("SELECT name FROM _migrations ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  } finally {
    copy.close();
  }
}

function copyExtras(fromRoot: string, toRoot: string): number {
  let count = 0;
  for (const entry of EXTRA_ENTRIES) {
    const src = path.join(fromRoot, entry);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(toRoot, entry), { recursive: true });
    count += fs.statSync(src).isDirectory() ? fs.readdirSync(src).length : 1;
  }
  return count;
}

function readManifest(dir: string): Manifest {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), "utf-8")) as Partial<Manifest>;
  if (raw.format !== "qyrex-backup" || typeof raw.sha256 !== "string" || !Array.isArray(raw.migrations)) {
    throw new Error("Manifesto do backup inválido.");
  }
  return raw as Manifest;
}

function toInfo(id: string, manifest: Manifest, problem: string | null): BackupInfo {
  return {
    id,
    kind: manifest.kind,
    createdAt: manifest.createdAt,
    appVersion: manifest.appVersion,
    migrations: manifest.migrations,
    sizeBytes: manifest.sizeBytes,
    sha256: manifest.sha256,
    extraFiles: manifest.extraFiles,
    valid: problem === null,
    problem,
  };
}

/** Cria um backup a partir de uma conexão aberta. Síncrono: o banco do Qyrex é pequeno. */
export function writeBackup(database: Database.Database, kind: BackupKind): BackupInfo {
  const root = backupsDir();
  fs.mkdirSync(root, { recursive: true });
  const id = newId(kind);
  const tmp = path.join(root, `.tmp-${id}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  try {
    const dbCopy = path.join(tmp, DB_FILE_NAME);
    database.prepare("VACUUM INTO ?").run(dbCopy);
    const migrations = inspectDatabase(dbCopy);
    const extraFiles = copyExtras(app.getPath("userData"), path.join(tmp, FILES_DIR));
    const manifest: Manifest = {
      format: "qyrex-backup",
      version: 1,
      kind,
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      migrations,
      sizeBytes: fs.statSync(dbCopy).size,
      sha256: sha256File(dbCopy),
      extraFiles,
    };
    fs.writeFileSync(path.join(tmp, MANIFEST), JSON.stringify(manifest, null, 2));
    fs.renameSync(tmp, path.join(root, id));
    log.info(`Backup criado (${kind}): ${id}`);
    // Só depois do novo estar validado e no lugar, os antigos do mesmo tipo podem sair.
    prune(kind);
    return toInfo(id, manifest, null);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
}

export function createBackup(kind: BackupKind = "manual"): BackupInfo {
  return writeBackup(getDb(), kind);
}

/** Lista do mais novo para o mais antigo. Checagem leve (manifesto, arquivo, tamanho); a completa é `verifyBackup`. */
export function listBackups(): BackupInfo[] {
  const root = backupsDir();
  if (!fs.existsSync(root)) return [];
  const list: BackupInfo[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = path.join(root, entry.name);
    let manifest: Manifest;
    try {
      manifest = readManifest(dir);
    } catch {
      list.push({
        id: entry.name,
        kind: "manual",
        createdAt: fs.statSync(dir).mtime.toISOString(),
        appVersion: "?",
        migrations: [],
        sizeBytes: 0,
        sha256: "",
        extraFiles: 0,
        valid: false,
        problem: tt("Manifesto ausente ou ilegível."),
      });
      continue;
    }
    const dbFile = path.join(dir, DB_FILE_NAME);
    let problem: string | null = null;
    if (!fs.existsSync(dbFile)) problem = tt("O arquivo do banco não está no backup.");
    else if (fs.statSync(dbFile).size !== manifest.sizeBytes) problem = tt("O tamanho do banco não bate com o manifesto.");
    list.push(toInfo(entry.name, manifest, problem));
  }
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Confere hash e integridade do banco do backup. */
export function verifyBackup(id: string): BackupInfo {
  const dir = backupPath(id);
  const manifest = readManifest(dir);
  const dbFile = path.join(dir, DB_FILE_NAME);
  let problem: string | null = null;
  if (!fs.existsSync(dbFile)) problem = tt("O arquivo do banco não está no backup.");
  else if (sha256File(dbFile) !== manifest.sha256) problem = tt("O banco foi alterado depois do backup (hash diferente).");
  else {
    // Confere numa cópia temporária: abrir o próprio arquivo poderia alterá-lo.
    const probe = path.join(backupsDir(), `.verify-${id}.sqlite`);
    try {
      fs.copyFileSync(dbFile, probe);
      inspectDatabase(probe);
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
    } finally {
      fs.rmSync(probe, { force: true });
    }
  }
  return toInfo(id, manifest, problem);
}

/**
 * Restaura um backup. Antes de tocar em qualquer coisa: confere o backup,
 * recusa um banco de uma versão MAIS NOVA do app (migrations desconhecidas) e
 * faz um backup "antes de restaurar" do estado atual, para dar como desfazer.
 */
export function restoreBackup(id: string): { restored: BackupInfo; safety: BackupInfo } {
  const info = verifyBackup(id);
  if (!info.valid) throw new Error(tt("Backup inválido: {problem}", { problem: info.problem ?? "" }));

  const known = new Set((getDb().prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name));
  const unknown = info.migrations.filter((m) => !known.has(m));
  if (unknown.length > 0) {
    throw new Error(tt("Este backup é de uma versão mais nova do Qyrex ({version}). Atualize o app antes de restaurar.", { version: info.appVersion }));
  }

  const safety = createBackup("pre-restore");
  const dir = backupPath(id);
  replaceDatabaseFile(path.join(dir, DB_FILE_NAME));

  // Arquivos do Qyrex voltam ao estado do backup (o atual está no backup de segurança).
  const userData = app.getPath("userData");
  for (const entry of EXTRA_ENTRIES) fs.rmSync(path.join(userData, entry), { recursive: true, force: true });
  const files = path.join(dir, FILES_DIR);
  if (fs.existsSync(files)) copyExtras(files, userData);

  log.info(`Backup restaurado: ${id} (estado anterior em ${safety.id})`);
  return { restored: info, safety };
}

export function deleteBackup(id: string): void {
  fs.rmSync(backupPath(id), { recursive: true, force: true });
}

/** Apaga os automáticos/de segurança além do limite. Manuais nunca saem sozinhos. */
function prune(kind: BackupKind): void {
  if (kind === "manual") return;
  const keep = kind === "auto" ? getSettings().backup.keep : KEEP_SAFETY;
  const sameKind = listBackups().filter((b) => b.kind === kind && b.valid);
  for (const old of sameKind.slice(keep)) deleteBackup(old.id);
}

/** Backup automático se estiver ligado e o último automático for mais velho que o intervalo. */
export function runAutoBackupIfDue(now = Date.now()): BackupInfo | null {
  const prefs = getSettings().backup;
  if (!prefs.auto) return null;
  const last = listBackups().find((b) => b.kind === "auto" && b.valid);
  if (last && now - Date.parse(last.createdAt) < prefs.intervalDays * 86_400_000) return null;
  return createBackup("auto");
}

let autoTimer: NodeJS.Timeout | null = null;

/** Confere 1 minuto depois de abrir e depois a cada 6 horas (não atrasa a abertura). */
export function startAutoBackup(): void {
  const tick = () => {
    try {
      runAutoBackupIfDue();
    } catch (err) {
      log.warn("Backup automático falhou:", err);
    }
  };
  setTimeout(tick, 60_000).unref();
  autoTimer = setInterval(tick, 6 * 3_600_000);
  autoTimer.unref();
}

export function stopAutoBackup(): void {
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

// --- Exportar / importar configurações -------------------------------------------

/**
 * Só preferências portáveis. Ficam de fora: pastas autorizadas e "todas as
 * pastas" (dizem respeito a este PC e liberam acesso a arquivos), caminho do
 * VS Code, onboarding e versão vista.
 */
const PORTABLE_KEYS = [
  "userName",
  "theme",
  "language",
  "autoUpdate",
  "discord",
  "startWithSystem",
  "minimizeToTray",
  "defaultTerminal",
  "aiDefaultProvider",
  "aiDefaultModel",
  "notifications",
  "splashAnimation",
  "businessMode",
  "backup",
  "focus",
  "dashboard",
] as const satisfies readonly (keyof AppSettings)[];

export function buildSettingsExport(settings = getSettings()): string {
  const picked: Record<string, unknown> = {};
  for (const key of PORTABLE_KEYS) picked[key] = settings[key];
  return JSON.stringify({ format: "qyrex-settings", version: 1, exportedAt: new Date().toISOString(), appVersion: app.getVersion(), settings: picked }, null, 2);
}

/** Lê um arquivo exportado. Só devolve o que passa no mesmo schema do `settings:update`. */
export function parseSettingsExport(raw: string, file: string): SettingsImport {
  let data: { format?: unknown; exportedAt?: unknown; appVersion?: unknown; settings?: unknown };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }
  if (data.format !== "qyrex-settings" || typeof data.settings !== "object" || data.settings === null) {
    throw new Error("O arquivo não é uma exportação de configurações do Qyrex.");
  }
  const portable: Record<string, unknown> = {};
  for (const key of PORTABLE_KEYS) {
    if (key in data.settings) portable[key] = (data.settings as Record<string, unknown>)[key];
  }
  const parsed = settingsPatch.safeParse(portable);
  if (!parsed.success) throw new Error("O arquivo tem configurações inválidas.");
  return {
    file,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : null,
    appVersion: typeof data.appVersion === "string" ? data.appVersion : null,
    patch: parsed.data as Partial<AppSettings>,
  };
}

const JSON_FILTER = [{ name: "JSON", extensions: ["json"] }];

/** Grava as configurações num arquivo escolhido no diálogo nativo. Devolve o caminho, ou null se cancelar. */
export async function exportSettingsToFile(win: BrowserWindow | null): Promise<string | null> {
  const options = { title: tt("Exportar configurações"), defaultPath: "qyrex-configuracoes.json", filters: JSON_FILTER };
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, buildSettingsExport(), "utf-8");
  return result.filePath;
}

/** Lê (sem aplicar) um arquivo escolhido no diálogo nativo; a UI confirma e aplica via `settings:update`. */
export async function readSettingsFile(win: BrowserWindow | null): Promise<SettingsImport | null> {
  const options = { title: tt("Importar configurações"), properties: ["openFile"] as "openFile"[], filters: JSON_FILTER };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return null;
  const file = result.filePaths[0];
  if (fs.statSync(file).size > 1_000_000) throw new Error("Arquivo grande demais para ser uma exportação de configurações.");
  return parseSettingsExport(fs.readFileSync(file, "utf-8"), file);
}
