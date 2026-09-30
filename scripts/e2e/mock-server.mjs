// Servidor de simulação das APIs externas para os testes E2E (npm run e2e).
// Responde no formato real de cada API (Anthropic, OpenAI, Gemini, GitHub,
// Spotify, Google OAuth/Calendar). Só escuta em 127.0.0.1.
// O app só aceita apontar para cá fora do instalador (ver endpoints.ts).
import http from "node:http";

const log = [];
let lastNotionPage = null;
const player = { isPlaying: true, progressMs: 42_000, volume: 60, track: 0 };
const TRACKS = [
  { name: "Faixa de Teste", artist: "Banda E2E", album: "Álbum Simulado" },
  { name: "Segunda Faixa", artist: "Banda E2E", album: "Álbum Simulado" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function lastUserText(messages) {
  const m = [...messages].reverse().find((x) => x.role === "user");
  if (!m) return "";
  if (typeof m.content === "string") return m.content;
  return (m.content ?? []).map((p) => p.text ?? "").join("");
}

/** Resposta simulada: ecoa o pedido e inclui comandos quando pedido. */
function answerFor(provider, text) {
  if (/comando/i.test(text)) {
    return `Resposta do ${provider}. Rode isto:\n\n\`\`\`powershell\nWrite-Output 'qyrex-ok'\n\`\`\`\n`;
  }
  if (/sintetiz|síntese|synthes/i.test(text)) return `Síntese do ${provider}: todos concordam.`;
  return `Resposta do ${provider} para: ${text.slice(0, 60).replace(/\n/g, " ")}`;
}

function chunksOf(text) {
  return text.match(/[\s\S]{1,12}/g) ?? [""];
}

function sse(res) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
}

const isSlow = (text) => /devagar|slow/i.test(text);

async function anthropicMessages(req, res, body) {
  const text = lastUserText(body.messages ?? []);
  const reply = answerFor("Claude", text);
  const slow = isSlow(text);
  const id = `msg_${Date.now()}`;
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
  sse(res);
  const input = Math.max(1, Math.round(JSON.stringify(body.messages).length / 4));
  send("message_start", {
    message: {
      id, type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null,
      usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  });
  send("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  const parts = slow ? Array.from({ length: 200 }, (_, i) => `palavra${i} `) : chunksOf(reply);
  for (const p of parts) {
    if (res.destroyed) return;
    send("content_block_delta", { index: 0, delta: { type: "text_delta", text: p } });
    await sleep(slow ? 150 : 5);
  }
  send("content_block_stop", { index: 0 });
  send("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: Math.round(reply.length / 4) } });
  send("message_stop", {});
  res.end();
}

async function openaiChat(req, res, body) {
  const text = lastUserText(body.messages ?? []);
  const reply = answerFor("GPT", text);
  const slow = isSlow(text);
  sse(res);
  const base = { id: "chatcmpl-e2e", object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: body.model };
  const parts = slow ? Array.from({ length: 200 }, (_, i) => `palavra${i} `) : chunksOf(reply);
  for (const p of parts) {
    if (res.destroyed) return;
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: p }, finish_reason: null }] })}\n\n`);
    await sleep(slow ? 150 : 5);
  }
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, prompt_tokens_details: { cached_tokens: 20 } } })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

async function geminiStream(req, res, body) {
  const text = (body.contents ?? []).filter((c) => c.role === "user").pop()?.parts?.map((p) => p.text).join("") ?? "";
  const reply = answerFor("Gemini", text);
  sse(res);
  const parts = chunksOf(reply);
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    res.write(`data: ${JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: p }] }, ...(last ? { finishReason: "STOP" } : {}) }],
      usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 5 * (i + 1), totalTokenCount: 90 + 5 * (i + 1) },
    })}\n\n`);
  });
  res.end();
}

function needAuth(req, res, prefix = "Bearer ") {
  const auth = req.headers.authorization ?? req.headers["x-api-key"] ?? req.headers["x-goog-api-key"] ?? "";
  if (!auth || /invalida|invalid/.test(String(auth))) {
    json(res, 401, { error: { message: "invalid api key", type: "authentication_error" }, message: "Bad credentials" });
    return true;
  }
  return false;
}

const now = () => new Date().toISOString();

function githubItems() {
  return [
    { number: 7, title: "Bug no login", state: "open", html_url: "https://github.com/qrz/demo/issues/7", updated_at: now(), user: { login: "alice" } },
    { number: 8, title: "PR: melhora o README", state: "open", html_url: "https://github.com/qrz/demo/pull/8", updated_at: now(), user: { login: "bob" }, pull_request: {} },
    { number: 5, title: "Adicionar modo escuro", state: "open", html_url: "https://github.com/qrz/demo/issues/5", updated_at: now(), user: { login: "carol" } },
  ];
}

function spotifyPlayer() {
  const t = TRACKS[player.track];
  return {
    is_playing: player.isPlaying,
    progress_ms: player.progressMs,
    device: { name: "PC de Teste", volume_percent: player.volume },
    item: {
      name: t.name, duration_ms: 200_000, artists: [{ name: t.artist }],
      album: { name: t.album, images: [] },
    },
  };
}

function googleEvents() {
  const d = new Date();
  d.setHours(15, 0, 0, 0);
  const end = new Date(d.getTime() + 3600_000);
  const tomorrow = new Date(Date.now() + 86_400_000);
  const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return [
    { id: "g1", status: "confirmed", summary: "Reunião Google E2E", location: "Meet", start: { dateTime: d.toISOString() }, end: { dateTime: end.toISOString() } },
    { id: "g2", status: "confirmed", summary: "Feriado E2E", start: { date: ymd(tomorrow) }, end: { date: ymd(new Date(tomorrow.getTime() + 86_400_000)) } },
    { id: "g3", status: "cancelled", summary: "Cancelado", start: { dateTime: d.toISOString() } },
  ];
}

async function route(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const p = url.pathname;
  const raw = req.method === "GET" ? "" : await readBody(req);
  let body = {};
  try { body = raw && raw.startsWith("{") ? JSON.parse(raw) : {}; } catch { body = {}; }
  log.push({ method: req.method, path: p + url.search, at: Date.now() });

  if (p === "/__log") return json(res, 200, log);
  if (p === "/__player") return json(res, 200, player);
  if (p === "/__notion") return json(res, 200, lastNotionPage);

  // ---------- Anthropic ----------
  if (p.startsWith("/anthropic/")) {
    if (needAuth(req, res)) return;
    if (p === "/anthropic/v1/models") {
      return json(res, 200, {
        data: [
          { type: "model", id: "claude-opus-5", display_name: "Claude Opus 5", created_at: now(), max_tokens: 64000 },
          { type: "model", id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5", created_at: now(), max_tokens: 64000 },
        ],
        has_more: false, first_id: "claude-opus-5", last_id: "claude-haiku-4-5",
      });
    }
    if (p === "/anthropic/v1/messages") return anthropicMessages(req, res, body);
  }

  // ---------- OpenAI ----------
  if (p.startsWith("/openai/")) {
    if (needAuth(req, res)) return;
    if (p === "/openai/v1/models") {
      return json(res, 200, { object: "list", data: [{ id: "gpt-5", created: 1_750_000_000, object: "model" }, { id: "gpt-5-mini", created: 1_750_000_001, object: "model" }] });
    }
    if (p === "/openai/v1/chat/completions") return openaiChat(req, res, body);
  }

  // ---------- Gemini ----------
  if (p.startsWith("/gemini/")) {
    if (needAuth(req, res)) return;
    if (p === "/gemini/v1beta/models") {
      return json(res, 200, { models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"], outputTokenLimit: 65536 }] });
    }
    if (/^\/gemini\/v1beta\/models\/[\w.-]+:streamGenerateContent$/.test(p)) return geminiStream(req, res, body);
  }

  // ---------- GitHub ----------
  if (p.startsWith("/github/")) {
    if (p === "/github/user") {
      if (needAuth(req, res)) return;
      return json(res, 200, { login: "qrz-e2e" });
    }
    const m = /^\/github\/repos\/([\w.-]+)\/([\w.-]+)(\/issues|\/pulls)?$/.exec(p);
    if (m) {
      if (!m[3]) {
        return json(res, 200, {
          full_name: `${m[1]}/${m[2]}`, description: "Repositório simulado", default_branch: "main",
          stargazers_count: 42, open_issues_count: 3, html_url: `https://github.com/${m[1]}/${m[2]}`, private: false,
        });
      }
      if (m[3] === "/issues") return json(res, 200, githubItems());
      return json(res, 200, githubItems().filter((i) => i.pull_request));
    }
    return json(res, 404, { message: "Not Found" });
  }

  // ---------- Spotify ----------
  if (p === "/spotify/authorize" || p === "/google/auth") {
    // Autoriza na hora e redireciona para o loopback do app, como o provedor real.
    const redirect = new URL(url.searchParams.get("redirect_uri") ?? "");
    if (redirect.hostname !== "127.0.0.1") return json(res, 400, { error: "redirect_uri inválido" });
    redirect.searchParams.set("code", "codigo-e2e");
    redirect.searchParams.set("state", url.searchParams.get("state") ?? "");
    res.writeHead(302, { Location: redirect.toString() });
    return res.end();
  }
  if (p === "/spotify/api/token" || p === "/google/token") {
    const params = new URLSearchParams(raw);
    if (params.get("grant_type") === "authorization_code" && (!params.get("code_verifier") || params.get("code") !== "codigo-e2e")) {
      return json(res, 400, { error: "invalid_grant" });
    }
    return json(res, 200, { access_token: `tok-${Date.now()}`, refresh_token: "refresh-e2e", expires_in: 3600, token_type: "Bearer" });
  }
  if (p.startsWith("/spotify/v1/")) {
    if (needAuth(req, res)) return;
    const sp = p.slice("/spotify/v1".length);
    if (sp === "/me") return json(res, 200, { display_name: "Ouvinte E2E", product: "premium" });
    if (sp === "/me/player" && req.method === "GET") return json(res, 200, spotifyPlayer());
    if (sp === "/me/player/play") { player.isPlaying = true; res.writeHead(204); return res.end(); }
    if (sp === "/me/player/pause") { player.isPlaying = false; res.writeHead(204); return res.end(); }
    if (sp === "/me/player/next") { player.track = (player.track + 1) % TRACKS.length; player.progressMs = 0; res.writeHead(204); return res.end(); }
    if (sp === "/me/player/previous") { player.track = (player.track + TRACKS.length - 1) % TRACKS.length; player.progressMs = 0; res.writeHead(204); return res.end(); }
    if (sp === "/me/player/volume") { player.volume = Number(url.searchParams.get("volume_percent")); res.writeHead(204); return res.end(); }
    if (sp === "/me/player/seek") { player.progressMs = Number(url.searchParams.get("position_ms")); res.writeHead(204); return res.end(); }
  }

  // ---------- Notion ----------
  if (p.startsWith("/notion/v1/")) {
    if (needAuth(req, res)) return;
    if (req.headers["notion-version"] !== "2022-06-28") return json(res, 400, { message: "Notion-Version ausente" });
    const np = p.slice("/notion/v1".length);
    const PAGE = "11111111-1111-4111-8111-111111111111";
    const DB = "22222222-2222-4222-8222-222222222222";
    const txt = (t) => [{ plain_text: t, annotations: {}, href: null }];
    const pageObj = { object: "page", id: PAGE, url: "https://www.notion.so/briefing", last_edited_time: now(), icon: { type: "emoji", emoji: "☕" }, properties: { title: { type: "title", title: txt("Briefing E2E") } } };
    const dbObj = { object: "database", id: DB, url: "https://www.notion.so/db", last_edited_time: now(), icon: null, title: txt("Tarefas E2E") };
    if (np === "/users/me") return json(res, 200, { object: "user", name: "Qyrex", bot: { workspace_name: "Workspace E2E" } });
    if (np === "/search") {
      const q = (body.query ?? "").toLowerCase();
      const kind = body.filter?.value;
      const all = [pageObj, dbObj].filter((o) => (!kind || o.object === kind) && (!q || (o.object === "page" ? "briefing e2e" : "tarefas e2e").includes(q)));
      return json(res, 200, { object: "list", results: all, has_more: false });
    }
    if (np === `/pages/${PAGE}`) return json(res, 200, pageObj);
    if (np === `/blocks/${PAGE}/children`) {
      return json(res, 200, {
        results: [
          { id: "b1", type: "heading_2", has_children: false, heading_2: { rich_text: txt("Objetivo do cliente") } },
          { id: "b2", type: "paragraph", has_children: false, paragraph: { rich_text: txt("Vender assinaturas de café pelo site.") } },
          { id: "b3", type: "to_do", has_children: false, to_do: { rich_text: txt("Página de planos"), checked: false } },
        ],
        has_more: false,
        next_cursor: null,
      });
    }
    if (np === `/databases/${DB}`) return json(res, 200, { object: "database", id: DB, properties: { Tarefa: { type: "title" }, Status: { type: "status" } } });
    if (np === "/pages" && req.method === "POST") {
      lastNotionPage = body;
      return json(res, 200, { object: "page", id: "33333333-3333-4333-8333-333333333333", url: "https://www.notion.so/nova", last_edited_time: now(), icon: null, properties: { title: { type: "title", title: txt("criada") } } });
    }
  }

  // ---------- Google ----------
  if (p === "/google/revoke") return json(res, 200, {});
  if (p === "/google/calendar/v3/calendars/primary/events") {
    if (needAuth(req, res)) return;
    return json(res, 200, { items: googleEvents() });
  }

  json(res, 404, { error: { message: `rota simulada inexistente: ${req.method} ${p}` } });
}

export function startMockServer(port = 0) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      route(req, res).catch((err) => {
        if (!res.headersSent) json(res, 500, { error: { message: String(err) } });
        else res.end();
      });
    });
    server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, log, player }));
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const { port } = await startMockServer(Number(process.env.PORT ?? 0));
  console.log(`mock em http://127.0.0.1:${port}`);
}
