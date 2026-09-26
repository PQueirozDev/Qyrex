import { app } from "electron";

/**
 * Endereços de todas as APIs externas usadas pelo QrzSpace.
 *
 * Para os testes E2E (scripts/e2e), a variável QRZ_TEST_API pode apontar
 * todas elas para um servidor de simulação local. O desvio só é aceito:
 *   - fora do app instalado (app.isPackaged === false), e
 *   - para http://127.0.0.1:<porta>.
 * No app instalado os endereços oficiais são fixos e nenhuma variável de
 * ambiente consegue redirecionar chaves ou tokens para outro lugar.
 */
export function testApiBase(): string | null {
  let packaged = true;
  try {
    packaged = app.isPackaged;
  } catch {
    packaged = true;
  }
  if (packaged) return null;
  const url = process.env.QRZ_TEST_API;
  return url && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(url) ? url : null;
}

const pick = (official: string, testPath: string) => {
  const base = testApiBase();
  return base ? `${base}${testPath}` : official;
};

export const endpoints = {
  anthropic: () => pick("https://api.anthropic.com", "/anthropic"),
  openai: () => pick("https://api.openai.com/v1", "/openai/v1"),
  gemini: () => pick("https://generativelanguage.googleapis.com/v1beta", "/gemini/v1beta"),
  github: () => pick("https://api.github.com", "/github"),
  notion: () => pick("https://api.notion.com/v1", "/notion/v1"),
  spotifyAuthorize: () => pick("https://accounts.spotify.com/authorize", "/spotify/authorize"),
  spotifyToken: () => pick("https://accounts.spotify.com/api/token", "/spotify/api/token"),
  spotifyApi: () => pick("https://api.spotify.com/v1", "/spotify/v1"),
  googleAuthorize: () => pick("https://accounts.google.com/o/oauth2/v2/auth", "/google/auth"),
  googleToken: () => pick("https://oauth2.googleapis.com/token", "/google/token"),
  googleRevoke: () => pick("https://oauth2.googleapis.com/revoke", "/google/revoke"),
  googleCalendar: () => pick("https://www.googleapis.com/calendar/v3", "/google/calendar/v3"),
};
