import { deleteSecret, getJsonSecret, getSecret, saveJsonSecret, saveSecret } from "../security/secrets.js";
import { getIntegrationMetadata, setIntegrationState } from "../services/integrationsService.js";
import { removeAllGoogleEvents, replaceGoogleEvents } from "../services/calendarService.js";
import { requestToken, runLoopbackFlow, type OAuthTokens } from "./oauth.js";
import { createLogger } from "../logger.js";

const log = createLogger("google-calendar");

/**
 * Google Calendar → Workspace (sincronização somente leitura).
 * OAuth de "App para computador" com PKCE + loopback em porta aleatória.
 * O client secret de apps desktop não é confidencial segundo o próprio Google,
 * mas mesmo assim fica no cofre cifrado, junto dos tokens.
 */
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = getIntegrationMetadata("google_calendar").clientId;
  const clientSecret = getSecret("google_calendar_client_secret");
  if (!clientId || !clientSecret) throw new Error("Informe Client ID e Client Secret do Google em Integrações.");
  return { clientId, clientSecret };
}

export async function connect(clientId: string, clientSecret: string): Promise<void> {
  saveSecret("google_calendar_client_secret", clientSecret);
  setIntegrationState("google_calendar", "disconnected", { clientId });

  const { code, redirectUri, verifier } = await runLoopbackFlow({
    port: 0,
    path: "/",
    buildAuthUrl: (redirect, state, challenge) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        access_type: "offline",
        prompt: "consent",
      }).toString()}`,
  });

  const tokens = await requestToken(TOKEN_URL, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: verifier,
  });
  saveJsonSecret("google_calendar_tokens", tokens);
  setIntegrationState("google_calendar", "connected", { clientId, lastError: undefined });
  log.info("Google Calendar conectado");
  await sync();
}

export async function disconnect(): Promise<void> {
  const tokens = getJsonSecret<OAuthTokens>("google_calendar_tokens");
  if (tokens) {
    // Revoga no Google também, não só apaga localmente.
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokens.refreshToken ?? tokens.accessToken }).toString(),
    }).catch(() => undefined);
  }
  deleteSecret("google_calendar_tokens");
  removeAllGoogleEvents();
  const { clientId } = getIntegrationMetadata("google_calendar");
  setIntegrationState("google_calendar", "disconnected", { clientId }, false);
}

async function accessToken(): Promise<string> {
  const tokens = getJsonSecret<OAuthTokens>("google_calendar_tokens");
  if (!tokens) throw new Error("Google Calendar não conectado.");
  if (tokens.expiresAt - 60_000 > Date.now()) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error("Sessão do Google expirada. Conecte novamente.");
  const { clientId, clientSecret } = credentials();
  try {
    const refreshed = await requestToken(
      TOKEN_URL,
      { grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: clientId, client_secret: clientSecret },
      tokens.refreshToken
    );
    saveJsonSecret("google_calendar_tokens", refreshed);
    return refreshed.accessToken;
  } catch (err) {
    setIntegrationState("google_calendar", "error", { lastError: "Sessão expirada. Conecte novamente." });
    throw err;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Converte Date → "AAAA-MM-DDTHH:MM:SS" no horário local (formato usado pela agenda). */
export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** Normaliza um evento da API (com horário ou dia inteiro) para o formato local. */
export function normalizeGoogleEvent(ev: GoogleEvent) {
  let startsAt: string;
  let endsAt: string | null = null;
  if (ev.start?.dateTime) {
    startsAt = toLocalIso(new Date(ev.start.dateTime));
    endsAt = ev.end?.dateTime ? toLocalIso(new Date(ev.end.dateTime)) : null;
  } else {
    // Dia inteiro: "date" é exclusivo no fim (termina no dia seguinte 00:00).
    startsAt = `${ev.start?.date}T00:00:00`;
    if (ev.end?.date) {
      const end = new Date(`${ev.end.date}T00:00:00`);
      end.setSeconds(end.getSeconds() - 1);
      endsAt = toLocalIso(end);
    }
  }
  return {
    externalId: ev.id,
    title: ev.summary?.trim() || "(sem título)",
    description: ev.description ?? null,
    startsAt,
    endsAt,
    location: ev.location ?? null,
  };
}

let syncing: Promise<number> | null = null;

/** Sincroniza de 30 dias atrás até 90 dias à frente. Chamadas simultâneas compartilham a mesma execução. */
export function sync(): Promise<number> {
  if (syncing) return syncing;
  syncing = (async () => {
    const token = await accessToken();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setDate(to.getDate() + 90);
    to.setHours(23, 59, 59, 0);

    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(`Google Calendar (${res.status}): ${body.error?.message ?? res.statusText}`);
      }
      const body = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
      events.push(...(body.items ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken && events.length < 2000);

    const normalized = events.filter((e) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date)).map(normalizeGoogleEvent);
    const count = replaceGoogleEvents({ from: toLocalIso(from), to: toLocalIso(to) }, normalized);
    setIntegrationState("google_calendar", "connected", { lastSync: new Date().toISOString(), lastError: undefined });
    log.info(`Google Calendar sincronizado: ${count} evento(s)`);
    return count;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}
