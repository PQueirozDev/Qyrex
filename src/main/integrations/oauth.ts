import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { shell } from "electron";
import { getSettings } from "../database/db.js";
import { translate } from "../../shared/i18n.js";

/**
 * Fluxo OAuth 2.0 para apps desktop (RFC 8252):
 * - navegador padrão do sistema (nunca uma webview dentro do app, onde o app
 *   poderia ler a senha do usuário);
 * - redirect para um servidor HTTP efêmero em 127.0.0.1;
 * - PKCE (S256) + `state` aleatório contra CSRF / interceptação do código.
 * A senha do usuário nunca passa pelo Workspace.
 */

export function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export interface LoopbackResult {
  code: string;
  redirectUri: string;
  verifier: string;
}

function page(title: string, body: string): string {
  const lang = getSettings().language;
  return `<!doctype html><html lang="${lang === "en" ? "en" : "pt-BR"}"><meta charset="utf-8"><title>QrzSpace</title>
<body style="font-family:system-ui;background:#0b0d10;color:#e6e8eb;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2>${title}</h2><p>${body}</p></div></body></html>`;
}

const tr = (text: string) => translate(getSettings().language, text);
const SUCCESS_HTML = () => page(tr("Conectado ✔"), tr("Você já pode fechar esta aba e voltar ao QrzSpace."));
const ERROR_HTML = (msg: string) => page(tr("Não foi possível conectar"), msg.replace(/[<>&"]/g, ""));

/**
 * Abre `buildAuthUrl(redirectUri, state, challenge)` no navegador e espera o
 * callback. `port = 0` usa uma porta livre qualquer (Google aceita);
 * provedores que exigem redirect fixo (Spotify) passam uma porta definida.
 */
export function runLoopbackFlow(options: {
  port: number;
  path?: string;
  buildAuthUrl: (redirectUri: string, state: string, codeChallenge: string) => string;
  timeoutMs?: number;
}): Promise<LoopbackResult> {
  const callbackPath = options.path ?? "/callback";
  const { verifier, challenge } = createPkcePair();
  const state = base64url(randomBytes(24));

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== callbackPath) {
        res.writeHead(404).end();
        return;
      }
      const finish = (err: Error | null, code?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        res.writeHead(err ? 400 : 200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(err ? ERROR_HTML(tr(err.message)) : SUCCESS_HTML());
        server.close();
        if (err) reject(err);
        else resolve({ code: code!, redirectUri, verifier });
      };

      if (url.searchParams.get("state") !== state) return finish(new Error("Resposta OAuth inválida (state não confere)."));
      const error = url.searchParams.get("error");
      if (error) return finish(new Error(error === "access_denied" ? "Acesso negado pelo usuário." : `Erro OAuth: ${error}`));
      const code = url.searchParams.get("code");
      if (!code) return finish(new Error("Resposta OAuth sem código de autorização."));
      finish(null, code);
    });

    let redirectUri = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(new Error("Tempo esgotado aguardando a autorização no navegador."));
    }, options.timeoutMs ?? 5 * 60_000);

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err.code === "EADDRINUSE" ? new Error(`A porta ${options.port} está em uso. Feche o outro programa e tente de novo.`) : err);
    });

    // Somente na interface de loopback: nada da rede local alcança este servidor.
    server.listen(options.port, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://127.0.0.1:${port}${callbackPath}`;
      void shell.openExternal(options.buildAuthUrl(redirectUri, state, challenge));
    });
  });
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** epoch ms */
  expiresAt: number;
}

/** POST x-www-form-urlencoded para o endpoint de token e normaliza a resposta. */
export async function requestToken(
  tokenUrl: string,
  params: Record<string, string>,
  previousRefreshToken: string | null = null
): Promise<OAuthTokens> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || `Falha ao obter token (HTTP ${res.status}).`);
  }
  return {
    accessToken: body.access_token,
    // Alguns provedores não devolvem novo refresh_token no refresh: mantém o anterior.
    refreshToken: body.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
}
