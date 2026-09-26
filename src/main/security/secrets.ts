import { safeStorage, app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * Segredos (API keys, tokens OAuth) NUNCA são gravados em texto puro em disco
 * nem no SQLite. `safeStorage.encryptString` usa o cofre de credenciais do SO
 * (DPAPI no Windows, Keychain no macOS, libsecret no Linux). O arquivo
 * resultante só é decifrável na mesma máquina/usuário que o criou.
 */

export type SecretName =
  | "anthropic"
  | "openai"
  | "google"
  | "github"
  | "spotify_tokens"
  | "google_calendar_tokens"
  | "google_calendar_client_secret"
  | "notion";

function secretsPath(): string {
  return path.join(app.getPath("userData"), "secrets.enc.json");
}

function readStore(): Record<string, string> {
  const p = secretsPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>): void {
  // Escrita atômica: grava num temporário e renomeia.
  const target = secretsPath();
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
  fs.renameSync(tmp, target);
}

export function saveSecret(name: SecretName, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Armazenamento seguro do sistema operacional indisponível neste ambiente.");
  }
  const store = readStore();
  store[name] = safeStorage.encryptString(value).toString("base64");
  writeStore(store);
}

export function getSecret(name: SecretName): string | null {
  const encoded = readStore()[name];
  if (!encoded) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encoded, "base64"));
  } catch {
    return null;
  }
}

export function hasSecret(name: SecretName): boolean {
  return Boolean(readStore()[name]);
}

export function deleteSecret(name: SecretName): void {
  const store = readStore();
  if (!(name in store)) return;
  delete store[name];
  writeStore(store);
}

export function saveJsonSecret(name: SecretName, value: unknown): void {
  saveSecret(name, JSON.stringify(value));
}

export function getJsonSecret<T>(name: SecretName): T | null {
  const raw = getSecret(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Nunca exibe a key inteira — só algo como "sk-a••••a91f" na UI. */
export function maskKey(apiKey: string): string {
  if (apiKey.length <= 12) return "••••••••";
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}
