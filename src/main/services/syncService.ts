import Database from "better-sqlite3";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, dialog, type BrowserWindow } from "electron";
import { getDb, replaceDatabaseFile } from "../database/db.js";
import { createLogger } from "../logger.js";
import { deleteSecret, getSecret, hasSecret, saveSecret } from "../security/secrets.js";
import { tt } from "../i18n.js";
import { createBackup, inspectDatabase } from "./backupService.js";
import type { SyncStatus } from "../../shared/types.js";

const log = createLogger("sync");

/**
 * Sincronização entre PCs por uma pasta que o usuário escolhe (normalmente
 * dentro do OneDrive/Google Drive/Dropbox). Estratégia:
 *
 * - Autenticação: é a do cliente da nuvem; o Qyrex não guarda credencial de nuvem.
 * - Proteção: cada cópia é cifrada (AES-256-GCM, chave scrypt de uma senha de
 *   sincronização guardada no cofre do SO). Antes de cifrar, a cópia perde o que
 *   é deste PC (pastas autorizadas, integrações, comandos liberados...) e passa
 *   por VACUUM, para não sobrar nada disso em páginas livres do arquivo.
 * - Conflito: a cópia vai inteira, sem mesclar. O estado local guarda a revisão
 *   e o hash do conteúdo da última sincronização. Só a nuvem mudou → recebe;
 *   só este PC mudou → envia; os dois mudaram → o usuário escolhe, e o lado
 *   descartado continua salvo (backup "antes de sincronizar" ou a cópia anterior
 *   na pasta).
 * - Nada roda sozinho: só sincroniza com um clique.
 */

const SYNC_DIR = "Qyrex-sync";
const MANIFEST = "latest.json";
const SNAPSHOTS = "snapshots";
const MAGIC = Buffer.from("QYXSYNC1");
const KEEP_SNAPSHOTS = 5;

/** Tabelas que são deste PC: nunca saem dele e nunca são trocadas ao receber. */
const LOCAL_TABLES = ["integrations", "allowed_commands", "app_usage", "notification_log"] as const;
/** Colunas de user_settings que são deste PC. */
const LOCAL_SETTINGS = ["allowed_project_dirs", "allow_all_dirs", "vscode_path", "start_with_system", "backup", "last_seen_version", "onboarding_completed"] as const;

interface LocalState {
  folder: string | null;
  deviceId: string;
  deviceName: string;
  lastRevision: string | null;
  lastHash: string | null;
  lastSyncAt: string | null;
}

interface Manifest {
  format: "qyrex-sync";
  version: 1;
  revision: string;
  baseRevision: string | null;
  deviceId: string;
  deviceName: string;
  createdAt: string;
  appVersion: string;
  migrations: string[];
  sha256: string;
}

// --- Estado local (arquivo em <userData>, fora do banco: não é trocado ao receber) ---

function statePath(): string {
  return path.join(app.getPath("userData"), "sync.json");
}

export function readState(): LocalState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), "utf-8")) as Partial<LocalState>;
    if (raw.deviceId) {
      return {
        folder: raw.folder ?? null,
        deviceId: raw.deviceId,
        deviceName: raw.deviceName || os.hostname(),
        lastRevision: raw.lastRevision ?? null,
        lastHash: raw.lastHash ?? null,
        lastSyncAt: raw.lastSyncAt ?? null,
      };
    }
  } catch {
    // primeira vez neste PC
  }
  const fresh: LocalState = { folder: null, deviceId: randomUUID(), deviceName: os.hostname(), lastRevision: null, lastHash: null, lastSyncAt: null };
  writeState(fresh);
  return fresh;
}

function writeState(state: LocalState): void {
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  const tmp = `${statePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath());
}

function syncRoot(state = readState()): string {
  if (!state.folder) throw new Error("Escolha a pasta de sincronização primeiro.");
  return path.join(state.folder, SYNC_DIR);
}

// --- Conteúdo: hash lógico do que é sincronizado ---------------------------------

/** Hash do conteúdo sincronizável (sem o que é deste PC). Muda só quando os dados mudam. */
export function contentHash(database: Database.Database = getDb()): string {
  const hash = createHash("sha256");
  const tables = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map((r) => r.name)
    .filter((t) => !(LOCAL_TABLES as readonly string[]).includes(t));
  for (const table of tables) {
    hash.update(`\u0000table:${table}\u0000`);
    for (const row of database.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).iterate() as Iterable<Record<string, unknown>>) {
      if (table === "user_settings") for (const col of LOCAL_SETTINGS) delete row[col];
      hash.update(JSON.stringify(row));
    }
  }
  return hash.digest("hex");
}

// --- Cifra ----------------------------------------------------------------------

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function encrypt(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decrypt(data: Buffer, passphrase: string): Buffer {
  if (data.length < MAGIC.length + 44 || !data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Arquivo de sincronização inválido.");
  let at = MAGIC.length;
  const salt = data.subarray(at, (at += 16));
  const iv = data.subarray(at, (at += 12));
  const tag = data.subarray(at, (at += 16));
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data.subarray(at)), decipher.final()]);
  } catch {
    throw new Error("Senha de sincronização incorreta (ou o arquivo foi alterado).");
  }
}

function passphrase(): string {
  const value = getSecret("sync_passphrase");
  if (!value) throw new Error("Defina a senha de sincronização primeiro.");
  return value;
}

// --- Configuração ---------------------------------------------------------------

export async function pickFolder(win: BrowserWindow | null): Promise<SyncStatus> {
  const options = { title: tt("Pasta de sincronização (ex.: dentro do OneDrive)"), properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[] };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return getStatus();
  return setFolder(result.filePaths[0]);
}

/** Exportado para os testes; na UI a pasta vem sempre do seletor nativo. */
export function setFolder(folder: string): SyncStatus {
  const resolved = path.resolve(folder);
  const userData = path.resolve(app.getPath("userData"));
  const rel = path.relative(userData, resolved);
  if (resolved === userData || (!rel.startsWith("..") && !path.isAbsolute(rel))) throw new Error("A pasta de sincronização não pode ficar dentro da pasta de dados do Qyrex.");
  fs.mkdirSync(path.join(resolved, SYNC_DIR, SNAPSHOTS), { recursive: true });
  const state = readState();
  // Pasta nova: o histórico de revisões da anterior não vale para ela.
  writeState({ ...state, folder: resolved, lastRevision: state.folder === resolved ? state.lastRevision : null, lastHash: state.folder === resolved ? state.lastHash : null });
  return getStatus();
}

export function setDeviceName(name: string): SyncStatus {
  writeState({ ...readState(), deviceName: name });
  return getStatus();
}

export function setPassphrase(value: string): SyncStatus {
  saveSecret("sync_passphrase", value);
  return getStatus();
}

/** Desliga neste PC: esquece a pasta e a senha. Os arquivos na nuvem ficam. */
export function disconnect(): SyncStatus {
  deleteSecret("sync_passphrase");
  writeState({ ...readState(), folder: null, lastRevision: null, lastHash: null, lastSyncAt: null });
  return getStatus();
}

// --- Estado ----------------------------------------------------------------------

function readManifest(root: string): Manifest | null {
  const file = path.join(root, MANIFEST);
  if (!fs.existsSync(file)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(file, "utf-8")) as Manifest;
    return m.format === "qyrex-sync" && typeof m.revision === "string" ? m : null;
  } catch {
    return null;
  }
}

function knownMigrations(): Set<string> {
  return new Set((getDb().prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name));
}

export function getStatus(): SyncStatus {
  const state = readState();
  const base = {
    folder: state.folder,
    deviceName: state.deviceName,
    hasPassphrase: hasSecret("sync_passphrase"),
    lastSyncAt: state.lastSyncAt,
    remote: null as SyncStatus["remote"],
  };
  if (!state.folder) return { ...base, state: "not-configured" };
  const root = path.join(state.folder, SYNC_DIR);
  if (!fs.existsSync(root)) return { ...base, state: "folder-missing" };
  const manifest = readManifest(root);
  const remote = manifest
    ? { deviceName: manifest.deviceName, createdAt: manifest.createdAt, appVersion: manifest.appVersion, fromThisDevice: manifest.deviceId === state.deviceId }
    : null;
  const localChanged = state.lastHash !== contentHash();
  if (!manifest) return { ...base, remote, state: "remote-empty" };
  if (manifest.migrations.some((m) => !knownMigrations().has(m))) return { ...base, remote, state: "remote-newer-app" };
  const remoteChanged = manifest.revision !== state.lastRevision;
  const st: SyncStatus["state"] = remoteChanged && localChanged ? "conflict" : remoteChanged ? "pull" : localChanged ? "push" : "in-sync";
  return { ...base, remote, state: st };
}

// --- Enviar / receber --------------------------------------------------------------

/** Cópia sem nada que seja deste PC, compactada (VACUUM tira restos de páginas livres). */
function portableSnapshot(dest: string): void {
  getDb().prepare("VACUUM INTO ?").run(dest);
  const copy = new Database(dest);
  try {
    copy.pragma("journal_mode = DELETE");
    for (const t of LOCAL_TABLES) copy.prepare(`DELETE FROM "${t}"`).run();
    copy.prepare("UPDATE user_settings SET allowed_project_dirs = '[]', allow_all_dirs = 0, vscode_path = NULL").run();
    copy.exec("VACUUM");
  } finally {
    copy.close();
  }
}

function writeAtomic(file: string, data: Buffer | string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function push(state: LocalState, root: string): void {
  const tmp = path.join(app.getPath("temp"), `qyrex-sync-${randomUUID()}.sqlite`);
  try {
    portableSnapshot(tmp);
    const migrations = inspectDatabase(tmp);
    const sealed = encrypt(fs.readFileSync(tmp), passphrase());
    const revision = randomUUID();
    const snapshotFile = path.join(root, SNAPSHOTS, `${revision}.qyx`);
    fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
    writeAtomic(snapshotFile, sealed);
    const manifest: Manifest = {
      format: "qyrex-sync",
      version: 1,
      revision,
      baseRevision: state.lastRevision,
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      migrations,
      sha256: createHash("sha256").update(sealed).digest("hex"),
    };
    // O manifesto só aponta para a cópia nova depois que ela está inteira na pasta.
    writeAtomic(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2));
    writeState({ ...state, lastRevision: revision, lastHash: contentHash(), lastSyncAt: manifest.createdAt });
    pruneSnapshots(root, revision);
    log.info(`Sincronização: enviada a revisão ${revision}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

type Row = Record<string, unknown>;

function pull(state: LocalState, root: string, manifest: Manifest): void {
  const sealed = fs.readFileSync(path.join(root, SNAPSHOTS, `${manifest.revision}.qyx`));
  if (createHash("sha256").update(sealed).digest("hex") !== manifest.sha256) {
    throw new Error("A cópia na pasta ainda está chegando ou foi alterada. Espere o OneDrive/Drive terminar de sincronizar e tente de novo.");
  }
  const tmp = path.join(app.getPath("temp"), `qyrex-sync-${randomUUID()}.sqlite`);
  try {
    fs.writeFileSync(tmp, decrypt(sealed, passphrase()));
    inspectDatabase(tmp);

    // O que é deste PC continua daqui.
    const db = getDb();
    const localRows = Object.fromEntries(LOCAL_TABLES.map((t) => [t, db.prepare(`SELECT * FROM "${t}"`).all() as Row[]]));
    const localSettings = db.prepare(`SELECT ${LOCAL_SETTINGS.join(", ")} FROM user_settings WHERE id = 1`).get() as Row;

    createBackup("pre-sync");
    replaceDatabaseFile(tmp);

    const fresh = getDb();
    fresh.transaction(() => {
      for (const table of LOCAL_TABLES) {
        fresh.prepare(`DELETE FROM "${table}"`).run();
        for (const row of localRows[table]) {
          const cols = Object.keys(row);
          fresh.prepare(`INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...cols.map((c) => row[c]));
        }
      }
      fresh.prepare(`UPDATE user_settings SET ${LOCAL_SETTINGS.map((c) => `${c} = ?`).join(", ")} WHERE id = 1`).run(...LOCAL_SETTINGS.map((c) => localSettings[c]));
    })();
    writeState({ ...state, lastRevision: manifest.revision, lastHash: contentHash(), lastSyncAt: new Date().toISOString() });
    log.info(`Sincronização: recebida a revisão ${manifest.revision} de ${manifest.deviceName}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function pruneSnapshots(root: string, current: string): void {
  const dir = path.join(root, SNAPSHOTS);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".qyx") && f !== `${current}.qyx`)
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(KEEP_SNAPSHOTS - 1)) fs.rmSync(path.join(dir, old.f), { force: true });
}

/**
 * Sincroniza. Em conflito sem `resolve`, não faz nada e devolve o estado
 * "conflict" para a UI perguntar. `resolve: "push"` mantém este PC (a cópia
 * anterior continua na pasta); `"pull"` usa a da nuvem (a daqui vira backup).
 */
export function syncNow(resolve?: "push" | "pull"): SyncStatus {
  const state = readState();
  const root = syncRoot(state);
  passphrase();
  const status = getStatus();
  if (status.state === "folder-missing") throw new Error("A pasta de sincronização não foi encontrada.");
  if (status.state === "remote-newer-app") throw new Error("A cópia na nuvem é de uma versão mais nova do Qyrex. Atualize este PC antes de sincronizar.");
  const action =
    status.state === "remote-empty" || status.state === "push"
      ? "push"
      : status.state === "pull"
        ? "pull"
        : status.state === "conflict"
          ? resolve ?? null
          : null;
  if (action === "push") push(state, root);
  else if (action === "pull") pull(state, root, readManifest(root)!);
  return getStatus();
}
