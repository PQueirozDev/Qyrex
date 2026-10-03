import { deleteSecret, getJsonSecret, saveJsonSecret } from "../security/secrets.js";
import { getIntegrationMetadata, setIntegrationState } from "../services/integrationsService.js";
import { requestToken, runLoopbackFlow, type OAuthTokens } from "./oauth.js";
import { createLogger } from "../logger.js";
import type { SpotifyPlayback } from "../../shared/types.js";
import { endpoints } from "./endpoints.js";

const log = createLogger("spotify");

/**
 * Spotify Web API com Authorization Code + PKCE (sem client secret).
 * O redirect precisa estar cadastrado EXATAMENTE assim no app do Spotify
 * Developer Dashboard: http://127.0.0.1:43821/callback
 */
export const SPOTIFY_REDIRECT_PORT = 43821;
const SCOPES = ["user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing"];

function clientId(): string {
  const id = getIntegrationMetadata("spotify").clientId;
  if (!id) throw new Error("Informe o Client ID do seu app Spotify em Integrações.");
  return id;
}

export async function connect(newClientId: string): Promise<void> {
  setIntegrationState("spotify", "disconnected", { clientId: newClientId });
  const { code, redirectUri, verifier } = await runLoopbackFlow({
    port: SPOTIFY_REDIRECT_PORT,
    buildAuthUrl: (redirect, state, challenge) =>
      `${endpoints.spotifyAuthorize()}?${new URLSearchParams({
        client_id: newClientId,
        response_type: "code",
        redirect_uri: redirect,
        code_challenge_method: "S256",
        code_challenge: challenge,
        state,
        scope: SCOPES.join(" "),
      }).toString()}`,
  });
  const tokens = await requestToken(endpoints.spotifyToken(), {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: newClientId,
    code_verifier: verifier,
  });
  saveJsonSecret("spotify_tokens", tokens);

  const me = await api<{ display_name?: string; product?: string }>("/me");
  setIntegrationState("spotify", "connected", {
    clientId: newClientId,
    account: me?.display_name ?? "Conta Spotify",
    product: me?.product ?? "",
    lastError: undefined,
  });
  log.info("Spotify conectado");
}

export function disconnect(): void {
  deleteSecret("spotify_tokens");
  const { clientId: id } = getIntegrationMetadata("spotify");
  setIntegrationState("spotify", "disconnected", { clientId: id }, false);
}

async function accessToken(): Promise<string> {
  const tokens = getJsonSecret<OAuthTokens>("spotify_tokens");
  if (!tokens) throw new Error("Spotify não conectado.");
  if (tokens.expiresAt - 60_000 > Date.now()) return tokens.accessToken;
  if (!tokens.refreshToken) throw new Error("Sessão do Spotify expirada. Conecte novamente.");
  try {
    const refreshed = await requestToken(
      endpoints.spotifyToken(),
      { grant_type: "refresh_token", refresh_token: tokens.refreshToken, client_id: clientId() },
      tokens.refreshToken
    );
    saveJsonSecret("spotify_tokens", refreshed);
    return refreshed.accessToken;
  } catch (err) {
    setIntegrationState("spotify", "error", { lastError: "Sessão expirada. Conecte novamente." });
    throw err;
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const token = await accessToken();
  const res = await fetch(`${endpoints.spotifyApi()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; reason?: string } };
    if (res.status === 403 && body.error?.reason === "PREMIUM_REQUIRED") {
      throw new Error("Este controle exige Spotify Premium (limitação da API do Spotify).");
    }
    if (res.status === 404 && body.error?.reason === "NO_ACTIVE_DEVICE") {
      throw new Error("Nenhum dispositivo ativo. Abra o Spotify e toque algo primeiro.");
    }
    if (res.status === 401) setIntegrationState("spotify", "error", { lastError: "Autorização revogada." });
    throw new Error(`Spotify (${res.status}): ${body.error?.message ?? res.statusText}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

interface PlayerResponse {
  is_playing: boolean;
  progress_ms: number | null;
  device?: { name?: string; volume_percent?: number | null };
  item?: {
    name: string;
    duration_ms: number;
    artists?: { name: string }[];
    album?: { name: string; images?: { url: string; width: number }[] };
    show?: { name: string };
  } | null;
}

export async function getPlayback(): Promise<SpotifyPlayback | null> {
  const data = await api<PlayerResponse>("/me/player?additional_types=episode");
  if (!data?.item) return null;
  const images = data.item.album?.images ?? [];
  const cover = images.find((i) => i.width <= 300) ?? images[0];
  return {
    isPlaying: data.is_playing,
    track: data.item.name,
    artists: data.item.artists?.map((a) => a.name).join(", ") ?? data.item.show?.name ?? "",
    album: data.item.album?.name ?? "",
    coverUrl: cover?.url ?? null,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item.duration_ms,
    volumePercent: data.device?.volume_percent ?? null,
    deviceName: data.device?.name ?? null,
  };
}

export async function control(action: "play" | "pause" | "next" | "previous"): Promise<void> {
  const map = {
    play: ["PUT", "/me/player/play"],
    pause: ["PUT", "/me/player/pause"],
    next: ["POST", "/me/player/next"],
    previous: ["POST", "/me/player/previous"],
  } as const;
  const [method, path] = map[action];
  await api(path, { method });
}

export async function setVolume(percent: number): Promise<void> {
  const v = Math.round(Math.min(100, Math.max(0, percent)));
  await api(`/me/player/volume?volume_percent=${v}`, { method: "PUT" });
}

export async function seek(positionMs: number): Promise<void> {
  await api(`/me/player/seek?position_ms=${Math.max(0, Math.round(positionMs))}`, { method: "PUT" });
}
