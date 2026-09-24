import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, setDbForTesting, updateSettings } from "../src/main/database/db";

export const MIGRATIONS_DIR = path.resolve(__dirname, "../src/main/database/migrations");

/** Banco SQLite em memória com todas as migrations aplicadas. */
export function freshDb() {
  const db = openDatabase(":memory:", MIGRATIONS_DIR);
  setDbForTesting(db);
  return db;
}

/** Cria uma pasta temporária real e a autoriza no Workspace. */
export function tempAllowedDir(prefix = "pqw-"): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  updateSettings({ allowedProjectDirs: [dir] });
  return dir;
}

export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
