import { getDb } from "../database/db.js";
import { hasSecret } from "../security/secrets.js";
import type { IntegrationId, IntegrationState, IntegrationStatus } from "../../shared/types.js";

/**
 * Estado (não sensível) de cada integração na tabela `integrations`.
 * Segredos ficam no cofre (security/secrets.ts); aqui vão só status,
 * mensagem de erro e metadados públicos (login, client ID, key mascarada).
 */

interface IntegrationRow {
  provider: string;
  status: string;
  metadata: string;
}

export const ALL_INTEGRATIONS: IntegrationId[] = [
  "anthropic",
  "openai",
  "google",
  "github",
  "google_calendar",
  "spotify",
  "notion",
  "whatsapp",
];

export function setIntegrationState(
  id: IntegrationId,
  state: IntegrationState,
  metadata: Record<string, string | undefined> = {},
  mergeMetadata = true
): void {
  const current = mergeMetadata ? getIntegrationMetadata(id) : {};
  const merged: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(metadata)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  getDb()
    .prepare(
      `INSERT INTO integrations (id, provider, status, connected_at, metadata)
       VALUES (?, ?, ?, CASE WHEN ? = 'connected' THEN datetime('now') ELSE NULL END, ?)
       ON CONFLICT(provider) DO UPDATE SET
         status = excluded.status,
         connected_at = CASE WHEN excluded.status = 'connected' THEN COALESCE(integrations.connected_at, excluded.connected_at) ELSE NULL END,
         metadata = excluded.metadata`
    )
    .run(`integ-${id}`, id, state, state, JSON.stringify(merged));
}

export function getIntegrationMetadata(id: IntegrationId): Record<string, string> {
  const row = getDb().prepare("SELECT metadata FROM integrations WHERE provider = ?").get(id) as
    | { metadata: string }
    | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.metadata) as Record<string, string>;
  } catch {
    return {};
  }
}

const SECRET_FOR: Partial<Record<IntegrationId, Parameters<typeof hasSecret>[0]>> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  github: "github",
  spotify: "spotify_tokens",
  google_calendar: "google_calendar_tokens",
  notion: "notion",
};

export function listIntegrationStatus(): IntegrationStatus[] {
  const rows = getDb().prepare("SELECT provider, status, metadata FROM integrations").all() as IntegrationRow[];
  const byId = new Map(rows.map((r) => [r.provider, r]));

  return ALL_INTEGRATIONS.map((id) => {
    const row = byId.get(id);
    let info: Record<string, string> = {};
    try {
      info = row ? (JSON.parse(row.metadata) as Record<string, string>) : {};
    } catch {
      info = {};
    }
    const { lastError, ...publicInfo } = info;
    const secret = SECRET_FOR[id];
    let state: IntegrationState = (row?.status as IntegrationState) ?? "disconnected";
    // Se o segredo sumiu (ex.: perfil copiado para outra máquina), não está conectado.
    // Conexão pela assinatura (Claude Code / Codex) não tem segredo guardado no app.
    const viaSubscription = info.authMode === "subscription";
    if (secret && state === "connected" && !viaSubscription && !hasSecret(secret)) state = "disconnected";
    // WhatsApp não tem credencial: funciona via links oficiais (wa.me / app desktop).
    if (id === "whatsapp") state = "connected";
    return { id, state, detail: state === "error" ? lastError ?? "Erro desconhecido" : null, info: publicInfo };
  });
}
