// E2E do QrzSpace: sobe o servidor de simulação das APIs, o Vite e o Electron
// (perfil temporário, DevTools Protocol na porta 9223) e percorre os fluxos
// reais pela interface: integrações, chat, Council, uso, GitHub, Spotify,
// Google Agenda, git, terminal, CRUDs e a interface em inglês.
//
// Uso: npm run e2e            (E2E_SHOTS=<pasta> salva screenshots)
// O app só aceita o desvio de APIs fora do instalador e para 127.0.0.1.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockServer } from "./mock-server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CDP_PORT = 9223;
const SHOTS = process.env.E2E_SHOTS ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const problems = [];
let failed = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer().once("error", () => resolve(false)).once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

async function waitTcp(port, timeout = 60_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const ok = await new Promise((resolve) => {
      const s = net.connect(port, "localhost").once("connect", () => (s.end(), resolve(true))).once("error", () => resolve(false));
    });
    if (ok) return;
    await sleep(300);
  }
  throw new Error(`porta ${port} não abriu`);
}

// ---------- preparação ----------
for (const port of [5173, CDP_PORT, 43821]) {
  if (!(await portFree(port))) {
    console.error(`A porta ${port} está em uso. Feche o que estiver nela (outro dev server/instância de teste) e rode de novo.`);
    process.exit(2);
  }
}

console.log("Compilando o processo main...");
execFileSync(process.execPath, [path.join(ROOT, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.main.json"], { cwd: ROOT, stdio: "inherit" });
execFileSync(process.execPath, [path.join(ROOT, "scripts/copy-migrations.mjs")], { cwd: ROOT, stdio: "inherit" });

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "qrz-e2e-"));
const PROFILE = path.join(TMP, "perfil");
const WORK = path.join(TMP, "trabalho");
const PROJECT = path.join(WORK, "demo");
const TMP_NAME = path.basename(TMP);
fs.mkdirSync(PROJECT, { recursive: true });
fs.writeFileSync(path.join(PROJECT, "README.md"), "# Demo E2E\n\nConteúdo secreto-e2e para anexo.\n");
const git = (...args) => execFileSync("git", args, { cwd: PROJECT, encoding: "utf8" }).trim();
git("init", "-q", "-b", "main");
git("config", "user.email", "e2e@qrzspace.local");
git("config", "user.name", "QrzSpace E2E");
git("add", "-A");
git("commit", "-q", "-m", "Primeiro commit");

const mock = await startMockServer();
const API = `http://127.0.0.1:${mock.port}`;
console.log(`Mock das APIs em ${API} | perfil ${PROFILE}`);

const children = [];
function cleanup() {
  for (const c of children) {
    try {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else c.kill("SIGKILL");
    } catch {
      /* já saiu */
    }
  }
  mock.server.close();
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

const vite = spawn(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "--port", "5173", "--strictPort"], { cwd: ROOT, stdio: "ignore" });
children.push(vite);
await waitTcp(5173);

const electronExe = (await import("electron")).default;
const appEnv = { ...process.env, QRZ_TEST_API: API };
delete appEnv.ELECTRON_RUN_AS_NODE;
const app = spawn(electronExe, [".", `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${CDP_PORT}`], {
  cwd: ROOT,
  env: appEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
children.push(app);
let mainLog = "";
app.stdout.on("data", (d) => (mainLog += d));
app.stderr.on("data", (d) => (mainLog += d));

// ---------- DevTools Protocol ----------
let ws;
let seq = 0;
const pending = new Map();

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
      const page = targets.find((t) => t.type === "page" && t.url.startsWith("http://localhost:5173"));
      if (!page) throw new Error("sem página");
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        ws.addEventListener("open", resolve);
        ws.addEventListener("error", reject);
      });
      ws.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) {
          pending.get(m.id)(m);
          pending.delete(m.id);
        } else if (m.method === "Runtime.exceptionThrown") {
          problems.push(`EXCEPTION: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
        } else if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
          const text = m.params.args.map((a) => a.value ?? a.description).join(" ");
          // Aviso padrão do Electron em dev (CSP com unsafe-inline por causa do HMR do Vite).
          if (!/Electron Security Warning|Download the React DevTools/.test(text)) problems.push(`console.${m.params.type}: ${text.slice(0, 300)}`);
        }
      });
      await send("Runtime.enable");
      await send("Page.enable");
      await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`sem conexão com o DevTools do app
${mainLog.slice(-3000)}`);
}

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

async function ev(expr) {
  const res = await send("Runtime.evaluate", { expression: `(async () => { ${HELPERS}; ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description ?? res.result.exceptionDetails.text);
  return res.result?.result?.value;
}

// Funções usadas dentro da página.
const HELPERS = `
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const visible = (el) => !!el && el.getClientRects().length > 0;
  const textOf = (el) => (el?.textContent ?? "").replace(/\\s+/g, " ").trim();
  const findButton = (label, root = document) =>
    $$("button", root).filter(visible).find((b) => textOf(b) === label || b.getAttribute("aria-label") === label || b.title === label) ??
    $$("button", root).filter(visible).find((b) => textOf(b).includes(label));
  const cardOf = (title) => $$("p").find((p) => textOf(p) === title)?.closest(".card-interactive") ?? null;
  const dialog = () => $$("[role=dialog]").filter(visible).pop() ?? null;
  const setSelect = (sel, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    setter.call(sel, value);
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  };
`;

async function waitFor(expr, { timeout = 10_000, label = expr } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      // Elementos do DOM não atravessam o CDP por valor: vira true.
      last = await ev(`const v = (${expr}); return v instanceof Node ? true : v;`);
      if (last) return last;
    } catch (err) {
      last = err.message;
    }
    await sleep(200);
  }
  throw new Error(`tempo esgotado esperando: ${label} (último: ${JSON.stringify(last)?.slice(0, 200)})`);
}

async function click(label, scopeExpr = "document") {
  const ok = await ev(`const b = findButton(${JSON.stringify(label)}, ${scopeExpr}); if (!b) return false; if (b.disabled) return "disabled"; b.click(); return true;`);
  if (ok !== true) throw new Error(`botão "${label}" ${ok === "disabled" ? "desabilitado" : "não encontrado"}`);
  await sleep(150);
}

/** Foca o elemento e digita como um usuário (dispara os eventos do React). */
async function type(selectorExpr, text, { enter = false } = {}) {
  const ok = await ev(`const el = ${selectorExpr}; if (!el) return false; el.focus(); if (el.select) el.select(); return true;`);
  if (!ok) throw new Error(`campo não encontrado: ${selectorExpr}`);
  await send("Input.insertText", { text });
  if (enter) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  }
  await sleep(100);
}

const nav = async (label) => {
  const r = await ev(`const b = $$("aside nav button").find((e) => textOf(e) === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true;`);
  if (!r) throw new Error(`item "${label}" não está na barra lateral`);
  await sleep(700);
};

async function shot(name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const res = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(res.result.data, "base64"));
}

async function step(name, fn) {
  const before = problems.length;
  try {
    const detail = await fn();
    const newProblems = problems.slice(before);
    check(name, newProblems.length === 0, [detail, ...newProblems].filter(Boolean).join(" | "));
  } catch (err) {
    check(name, false, err.message);
    await shot(`falha-${name.replace(/[^\w]+/g, "-")}`);
  }
}

const mockLog = () => fetch(`${API}/__log`).then((r) => r.json());
const mockCalls = async (re) => (await mockLog()).filter((l) => re.test(`${l.method} ${l.path}`));

// ---------- fluxos ----------
await connect();
await waitFor(`document.querySelector("#root")?.children.length > 0`, { timeout: 30_000, label: "app renderizar" });

await step("perfil de teste (pasta autorizada, onboarding)", async () => {
  const r = await ev(`
    const w = window.workspace;
    const a = await w.settings.addAllowedDir(${JSON.stringify(WORK)});
    const s = await w.settings.update({ onboardingCompleted: true, userName: "E2E" });
    return [a.ok || a.error, s.ok || s.error].join(",");`);
  await send("Page.reload");
  await sleep(2000);
  await waitFor(`$$("aside nav button").length > 5`, { label: "barra lateral" });
  const discord = await ev(`return (await window.workspace.discord.status()).data`);
  if (discord !== "disabled") throw new Error(`Discord deveria ficar desligado no modo de teste (está ${discord})`);
  return r;
});

await step("integrações de IA conectadas pela UI (Claude, OpenAI, Gemini)", async () => {
  await nav("Integrações");
  for (const [title, key] of [["Claude (Anthropic)", "sk-ant-e2e"], ["OpenAI", "sk-e2e-openai"], ["Gemini (Google)", "AIza-e2e-0123456789"]]) {
    await waitFor(`cardOf(${JSON.stringify(title)})`, { label: `card ${title}` });
    // Claude e OpenAI mostram primeiro "Usar minha assinatura"; a API key fica atrás de "Usar API key".
    await ev(`const b = findButton("Usar API key", cardOf(${JSON.stringify(title)})); if (b) b.click(); return 1;`);
    await sleep(150);
    await type(`cardOf(${JSON.stringify(title)}).querySelector("input[type=password]")`, key);
    await click("Conectar", `cardOf(${JSON.stringify(title)})`);
    await waitFor(`textOf(cardOf(${JSON.stringify(title)})).includes("API key:")`, { label: `${title} conectado` });
  }
  const invalid = await ev(`return (await window.workspace.ai.connect("openai", "chave-invalida-e2e")).data`);
  if (invalid?.ok !== false) throw new Error("key inválida deveria ser recusada");
  const still = await ev(`return (await window.workspace.integrations.list()).data.find((i) => i.id === "openai").state`);
  if (still !== "connected") throw new Error(`key antiga deveria continuar valendo (estado: ${still})`);
  const masked = await ev(`return textOf(cardOf("OpenAI"))`);
  if (masked.includes("sk-e2e-openai")) throw new Error("key aparece inteira na tela");
  return "keys mascaradas; key inválida recusada";
});

await step("GitHub conectado pela UI", async () => {
  await type(`cardOf("GitHub").querySelector("input[type=password]")`, "github_pat_e2e_0123456789abcdef");
  await click("Conectar", `cardOf("GitHub")`);
  await waitFor(`textOf(cardOf("GitHub")).includes("qrz-e2e")`, { label: "login do GitHub" });
});

await step("Google Agenda: OAuth (PKCE + loopback) e sincronização", async () => {
  await type(`cardOf("Google Agenda").querySelector("input:not([type=password])")`, "e2e.apps.googleusercontent.com");
  await type(`cardOf("Google Agenda").querySelector("input[type=password]")`, "GOCSPX-e2e");
  await click("Conectar", `cardOf("Google Agenda")`);
  await waitFor(`findButton("Testar / Sincronizar", cardOf("Google Agenda"))`, { timeout: 15_000, label: "Google conectado" });
  const token = await mockCalls(/POST \/google\/token/);
  if (!token.length) throw new Error("não trocou o código pelo token");
});

await step("Spotify (opcional): OAuth (PKCE + loopback) e controles pela Web API", async () => {
  await type(`cardOf("Spotify").querySelector("input")`, "spotify-client-e2e");
  await click("Conectar", `cardOf("Spotify")`);
  await waitFor(`textOf(cardOf("Spotify")).includes("Conta: Ouvinte E2E")`, { timeout: 15_000, label: "conta Spotify" });
  const track = await ev(`return (await window.workspace.spotify.playback()).data?.track`);
  if (track !== "Faixa de Teste") throw new Error(`faixa: ${track}`);
  await ev(`await window.workspace.spotify.control("next"); await window.workspace.spotify.control("pause"); return 1;`);
  const player = await (await fetch(`${API}/__player`)).json();
  if (player.isPlaying || player.track !== 1) throw new Error(`mock: ${JSON.stringify(player)}`);
  await shot("integracoes");
  return "próxima e pausar";
});

await step("mini player lê a mídia do Windows (sem controlar a música de quem roda o teste)", async () => {
  const res = await ev(`const r = await window.workspace.media.state(); return { ok: r.ok, title: r.data?.title ?? null }`);
  if (!res.ok) throw new Error("media:state falhou");
  const expected = res.title ?? "Nada tocando agora";
  await waitFor(`textOf(document.querySelector("aside")).includes(${JSON.stringify(expected)})`, { timeout: 10_000, label: "mini player" });
  const bad = await ev(`return (await window.workspace.media.control("rm -rf")).ok`);
  if (bad !== false) throw new Error("ação de mídia fora da lista foi aceita");
  return res.title ? "tocando: " + res.title : "nada tocando";
});

await step("projeto com repositório GitHub: issues e PRs no painel", async () => {
  const r = await ev(`
    const res = await window.workspace.projects.create({ name: "Demo E2E", localPath: ${JSON.stringify(PROJECT)}, githubUrl: "https://github.com/qrz/demo" });
    return res.ok || res.error;`);
  if (r !== true) throw new Error(String(r));
  await nav("Projetos");
  await waitFor(`$$("p").some((p) => textOf(p) === "Demo E2E")`, { label: "card do projeto" });
  await click("Detalhes");
  await waitFor(`textOf(document.querySelector("[data-drawer]")).includes("Bug no login")`, { timeout: 15_000, label: "issues do GitHub" });
  const txt = await ev(`return textOf(document.querySelector("[data-drawer]"))`);
  if (!txt.includes("PR: melhora o README")) throw new Error("PR não apareceu");
  const issuesPart = txt.slice(txt.indexOf("Issues abertas"));
  if (issuesPart.includes("PR: melhora o README")) throw new Error("PR listado também como issue");
  await shot("projeto-github");
  return "2 issues + 1 PR";
});

await step("commit pelo painel do projeto (com confirmação)", async () => {
  fs.writeFileSync(path.join(PROJECT, "novo.txt"), "alteração do E2E\n");
  await click("Atualizar", `document.querySelector("[data-drawer]")`);
  await waitFor(`textOf(document.querySelector("[data-drawer]")).includes("1 alterado(s)")`, { label: "status git com alteração" });
  await type(`document.querySelector("[data-drawer]").querySelector("[placeholder='Mensagem do commit']")`, "Commit pelo E2E");
  await click("Commit", `document.querySelector("[data-drawer]")`);
  await waitFor(`$$("[role=dialog]").some((d) => textOf(d).includes("Criar commit?"))`, { label: "confirmação do commit" });
  await click("Commitar", `$$("[role=dialog]").find((d) => textOf(d).includes("Criar commit?"))`);
  await waitFor(`textOf(document.querySelector("[data-drawer]")).includes("Limpo")`, { label: "git limpo após commit" });
  const last = git("log", "-1", "--pretty=%s");
  if (last !== "Commit pelo E2E") throw new Error(`último commit: ${last}`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  return last;
});

const chatBox = `document.querySelector("section textarea")`;
const lastAssistant = `textOf($$("section .prose, section [data-role=assistant]").pop())`;

await step("chat com Claude: streaming e resposta salva", async () => {
  await nav("IA");
  await click("Nova conversa");
  await waitFor(`dialog() && textOf(dialog()).includes("Começar")`, { label: "diálogo nova conversa" });
  await ev(`const sel = $$("select", dialog()).find((s) => [...s.options].some((o) => o.textContent === "Demo E2E")); setSelect(sel, [...sel.options].find((o) => o.textContent === "Demo E2E").value); return 1;`);
  await click("Começar", `dialog()`);
  await waitFor(`${chatBox}`, { label: "caixa de mensagem" });
  await type(chatBox, "Olá, tudo bem?", { enter: true });
  await waitFor(`textOf(document.querySelector("section")).includes("Resposta do Claude para: Olá, tudo bem?")`, { timeout: 15_000, label: "resposta do Claude" });
  await waitFor(`findButton("Regenerar resposta")`, { label: "fim do streaming" });
  const conv = await ev(`const c = (await window.workspace.ai.conversations.list()).data[0]; return (await window.workspace.ai.messages.list(c.id)).data.map((m) => m.role).join(",")`);
  if (conv !== "user,assistant") throw new Error(`mensagens salvas: ${conv}`);
  return conv;
});

await step("comando sugerido pela IA: diálogo de permissão e execução", async () => {
  await type(chatBox, "me passe um comando", { enter: true });
  await waitFor(`findButton("Executar")`, { timeout: 15_000, label: "botão Executar" });
  await click("Executar");
  await waitFor(`dialog() && textOf(dialog()).includes("Write-Output 'qrzspace-ok'")`, { label: "diálogo de permissão" });
  const risk = await ev(`return textOf(dialog())`);
  await click("Permitir uma vez", `dialog()`);
  await waitFor(`textOf(document.querySelector("section")).includes("Código de saída 0")`, { timeout: 20_000, label: "saída do comando" });
  const out = await ev(`return textOf(document.querySelector("section"))`);
  if (!out.includes("qrzspace-ok")) throw new Error("saída do comando não apareceu");
  return risk.match(/Risco: \S+/)?.[0] ?? "";
});

await step("regenerar resposta", async () => {
  const before = (await mockCalls(/POST \/anthropic\/v1\/messages/)).length;
  await click("Regenerar resposta");
  await waitFor(`findButton("Regenerar resposta")`, { timeout: 15_000, label: "nova resposta" });
  const after = (await mockCalls(/POST \/anthropic\/v1\/messages/)).length;
  if (after !== before + 1) throw new Error(`chamadas ${before} -> ${after}`);
});

await step("interromper resposta em andamento", async () => {
  await type(chatBox, "responda devagar", { enter: true });
  await waitFor(`textOf(document.querySelector("section")).includes("palavra3")`, { timeout: 15_000, label: "stream lento começar" });
  await click("Interromper");
  await waitFor(`findButton("Enviar")`, { label: "streaming parar" });
  await sleep(800);
  const txt = await ev(`return textOf(document.querySelector("section"))`);
  if (txt.includes("palavra199")) throw new Error("stream não foi interrompido");
  return "parou antes do fim";
});

await step("anexar arquivo do projeto à mensagem", async () => {
  await click("Anexar");
  await waitFor(`dialog() && textOf(dialog()).includes("README.md")`, { label: "lista de arquivos" });
  await ev(`$$("div", dialog()).find((d) => d.children.length >= 2 && textOf(d).startsWith("README.md")).click(); return 1;`);
  await click("Confirmar anexos", `dialog()`);
  await waitFor(`textOf(document.querySelector("section")).includes("Serão enviados:")`, { label: "chip do anexo" });
  await type(chatBox, "leia o anexo", { enter: true });
  await waitFor(`findButton("Regenerar resposta")`, { timeout: 15_000, label: "resposta com anexo" });
  const msgs = await ev(`const c = (await window.workspace.ai.conversations.list()).data[0]; return (await window.workspace.ai.messages.list(c.id)).data.filter((m) => m.role === "user").pop()`);
  if (!msgs.attachedFiles?.some((f) => f.name === "README.md")) throw new Error("anexo não registrado na mensagem");
  return "README.md anexado";
});

await step("AI Council com 3 providers + síntese", async () => {
  await click("AI Council");
  await waitFor(`$$("input[type=checkbox]").filter((c) => c.checked).length === 3`, { label: "3 providers marcados" });
  await type(`$$("textarea").find((t) => t.placeholder.startsWith("Pergunta para o conselho"))`, "Qual a melhor stack?");
  await click("Perguntar ao conselho");
  await waitFor(`dialog() && textOf(dialog()).includes("Enviar para 3")`, { label: "confirmação de 3 providers" });
  await click("Enviar para 3", `dialog()`);
  await waitFor(`$$("span").filter((s) => textOf(s) === "Pronto").length >= 3`, { timeout: 20_000, label: "3 respostas prontas" });
  const txt = await ev(`return textOf(document.querySelector("section"))`);
  for (const p of ["Resposta do Claude", "Resposta do GPT", "Resposta do Gemini"]) if (!txt.includes(p)) throw new Error(`faltou: ${p}`);
  await click("Sintetizar respostas");
  await waitFor(`textOf(document.querySelector("section")).includes("Síntese do")`, { timeout: 15_000, label: "síntese" });
  await shot("council");
});

await step("aba Uso registra tokens reais dos 3 providers", async () => {
  await click("Uso");
  await waitFor(`textOf(document.querySelector("section")).includes("claude-opus-5")`, { label: "tabela por modelo" });
  const s = await ev(`return (await window.workspace.ai.usage.summary(30)).data`);
  const providers = new Set(s.byModel.map((m) => m.provider));
  if (providers.size < 3) throw new Error(`providers no uso: ${[...providers]}`);
  if (!(s.totals.inputTokens > 0 && s.totals.outputTokens > 0)) throw new Error("tokens zerados");
  const gpt = s.byModel.find((m) => m.provider === "openai");
  // prompt_tokens 120 com 20 em cache: 100 de entrada normal + 20 de leitura de cache por chamada.
  if (gpt.inputTokens % 100 !== 0 || gpt.cacheReadTokens % 20 !== 0 || gpt.cacheReadTokens === 0) throw new Error(`tokens do GPT deveriam vir do chunk de usage, veio ${JSON.stringify(gpt)}`);
  await shot("uso");
  return `${s.totals.requests} req, ${s.totals.inputTokens} in / ${s.totals.outputTokens} out`;
});

await step("Agenda mostra eventos do Google (sem os cancelados) e cria evento", async () => {
  await nav("Agenda");
  await waitFor(`textOf(document.querySelector("main")).includes("Reunião Google E2E")`, { label: "evento do Google" });
  const txt = await ev(`return textOf(document.querySelector("main"))`);
  if (txt.includes("Cancelado")) throw new Error("evento cancelado apareceu");
  await click("Novo evento");
  await waitFor(`dialog()`, { label: "form do evento" });
  await type(`dialog().querySelector("input[placeholder='Título do evento']")`, "Evento criado no E2E");
  await click("Criar evento", `dialog()`);
  await waitFor(`textOf(document.querySelector("main")).includes("Evento criado no E2E")`, { label: "evento novo na agenda" });
  await shot("agenda");
});

await step("Notion: conectar, buscar, ler, criar página e mandar para a IA", async () => {
  await nav("Integrações");
  await waitFor(`cardOf("Notion")`, { label: "card do Notion" });
  const bad = await ev(`return (await window.workspace.notion.connect("token-qualquer")).ok`);
  if (bad !== false) throw new Error("token fora do formato foi aceito");
  await type(`cardOf("Notion").querySelector("input[type=password]")`, "ntn_e2e0123456789abcdefghijklmnop");
  await click("Conectar", `cardOf("Notion")`);
  await waitFor(`textOf(cardOf("Notion")).includes("Workspace E2E")`, { label: "workspace do Notion" });
  const masked = await ev(`return textOf(cardOf("Notion"))`);
  if (masked.includes("0123456789abcdef")) throw new Error("token aparece inteiro na tela");

  await nav("Notion");
  await waitFor(`textOf(document.querySelector("main")).includes("Briefing E2E")`, { label: "página na lista" });
  await click("Briefing E2E");
  await waitFor(`textOf(document.querySelector("main")).includes("Vender assinaturas de café pelo site.")`, { label: "conteúdo da página" });

  await click("Subpágina");
  await waitFor(`dialog() && textOf(dialog()).includes("Nova página no Notion")`, { label: "diálogo de nova página" });
  await ev(`const sel = dialog().querySelector("select"); setSelect(sel, "22222222-2222-4222-8222-222222222222"); return 1;`);
  await type(`dialog().querySelector("input.input")`, "Página criada pelo E2E");
  await type(`dialog().querySelector("textarea")`, "# Resumo\n- [ ] Revisar layout");
  await click("Criar página", `dialog()`);
  await sleep(1200);
  const created = await (await fetch(`${API}/__notion`)).json();
  if (created?.parent?.database_id !== "22222222-2222-4222-8222-222222222222") throw new Error(`pai errado: ${JSON.stringify(created?.parent)}`);
  if (!created.properties?.Tarefa) throw new Error("título não foi na propriedade de título do banco (Tarefa)");
  if (created.children?.[0]?.type !== "heading_1" || created.children?.[1]?.type !== "to_do") throw new Error("conteúdo não virou blocos");

  await nav("Notion");
  await waitFor(`textOf(document.querySelector("main")).includes("Briefing E2E")`, { label: "lista de novo" });
  await click("Briefing E2E");
  await waitFor(`findButton("Perguntar à IA") && !findButton("Perguntar à IA").disabled`, { label: "botão Perguntar à IA" });
  await click("Perguntar à IA");
  await waitFor(`(document.querySelector("section textarea")?.value ?? "").includes("Vender assinaturas de café")`, { timeout: 10_000, label: "rascunho no chat com o conteúdo" });
  return "conectado, lido, criado no banco e enviado para a IA";
});

await step("Tarefas: criar pelo campo rápido", async () => {
  await nav("Tarefas");
  await type(`$$("input").find((i) => i.placeholder.startsWith("Adicionar tarefa"))`, "Tarefa do E2E", { enter: true });
  await waitFor(`textOf(document.querySelector("main")).includes("Tarefa do E2E")`, { label: "tarefa criada" });
  const id = await ev(`return (await window.workspace.tasks.list({})).data.find((t) => t.title === "Tarefa do E2E")?.id ?? null`);
  if (!id) throw new Error("tarefa não salva no banco");
});

await step("Clientes: cadastrar cliente", async () => {
  await nav("Clientes");
  await click("Novo cliente");
  await waitFor(`document.querySelector("[data-drawer]")`, { label: "painel do cliente" });
  await type(`$$("input", document.querySelector("[data-drawer]")).find((i) => !i.readOnly && (i.type === "text" || !i.getAttribute("type")))`, "Cliente E2E");
  await click("Criar cliente", `document.querySelector("[data-drawer]")`);
  await waitFor(`textOf(document.querySelector("main")).includes("Cliente E2E")`, { label: "cliente na lista" });
  const saved = await ev(`return (await window.workspace.clients.list()).data.some((c) => c.name === "Cliente E2E")`);
  if (!saved) throw new Error("cliente não salvo no banco");
});

await step("Marketing: ideia rápida", async () => {
  await nav("Marketing");
  await type(`$$("input").find((i) => i.placeholder.startsWith("Anotar uma IDEIA"))`, "Ideia do E2E", { enter: true });
  await waitFor(`textOf(document.querySelector("main")).includes("Ideia do E2E")`, { label: "ideia no quadro" });
});

await step("Arquivos: navegar na pasta autorizada", async () => {
  await nav("Arquivos");
  await waitFor(`textOf(document.querySelector("main")).includes("demo")`, { label: "pasta demo" });
  const outside = await ev(`return (await window.workspace.files.list(${JSON.stringify(os.homedir())})).ok`);
  if (outside !== false) throw new Error("listou pasta fora da allowlist");
  return "fora da allowlist bloqueado";
});

await step("Terminal: executa comando no PowerShell", async () => {
  await nav("Terminal");
  await click("Novo terminal");
  await waitFor(`document.querySelector(".xterm-helper-textarea")`, { timeout: 15_000, label: "xterm" });
  await sleep(2500);
  await ev(`document.querySelector(".xterm-helper-textarea").focus(); return 1;`);
  await send("Input.insertText", { text: "echo qrz-terminal-ok" });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await waitFor(`(textOf(document.querySelector(".xterm-rows")).match(/qrz-terminal-ok/g) ?? []).length >= 2`, { timeout: 15_000, label: "saída do terminal" });
});

await step("interface em inglês: sem texto em português", async () => {
  await nav("Configurações");
  await ev(`document.querySelector('[data-language-option="en"]').click(); return 1;`);
  await sleep(3500);
  await connect();
  await waitFor(`$$("aside nav button").length > 5`, { label: "recarregar em inglês" });
  const SEEDED = ["e2e.apps.googleusercontent.com", "Português (Brasil)", "Bom dia! 3 tarefas para hoje.", "Demo E2E", "Tarefa do E2E", "Cliente E2E", "Ideia do E2E", "Evento criado no E2E", "Reunião Google E2E", "Feriado E2E", "Faixa de Teste", "Segunda Faixa", "Banda E2E", "Álbum Simulado", "Ouvinte E2E", "Resposta do", "Síntese do", "Olá, tudo bem", "Conteúdo secreto", "Primeiro commit", "Commit pelo E2E", "Bug no login", "PR: melhora", "Adicionar modo escuro", "Repositório simulado", "Qual a melhor stack", "leia o anexo", "me passe um comando", "responda devagar"];
  // Inglês não tem acentos nem cedilha: qualquer um fora dos dados de teste é texto sem tradução.
  const PT = /[ãõçáéíóúâêôà]|\b(não|você|para|com|sem|mais|nenhum|nenhuma|tarefa|projeto|cliente|conectado|desconectado|erro)\b/i;
  const leftovers = {};
  for (const label of ["Home", "AI", "Projects", "Terminal", "Files", "Tasks", "Calendar", "Clients", "Marketing", "WhatsApp", "Notion", "What's New", "Integrations", "Settings"]) {
    await nav(label);
    await sleep(900);
    const texts = await ev(`
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!visible(n.parentElement) || n.parentElement.closest(".xterm, [data-changelog]")) continue;
        const t = n.textContent.trim();
        if (t.length > 1) out.push(t);
      }
      $$("[placeholder], [title], [aria-label]").filter(visible).forEach((el) => {
        for (const a of ["placeholder", "title", "aria-label"]) { const v = el.getAttribute(a); if (v) out.push(v); }
      });
      return out;`);
    const media = await ev(`const r = await window.workspace.media.state(); return r.data ? [r.data.title, r.data.artist, r.data.album] : []`);
    const bad = texts.filter((t) => PT.test(t) && !SEEDED.some((s) => t.includes(s)) && !media.some((m) => m && t.includes(m)) && !t.includes(TMP_NAME) && !/^[\w.-]+\.(com|dev|io)(\/\S*)?$/.test(t));
    if (bad.length) leftovers[label] = [...new Set(bad)].slice(0, 12);
    await shot(`en-${label.replace(/\W/g, "")}`);
  }
  if (Object.keys(leftovers).length) throw new Error(JSON.stringify(leftovers));
  return "13 páginas";
});

await step("erros do processo main traduzidos para inglês", async () => {
  const err = await ev(`return (await window.workspace.files.list(${JSON.stringify(os.homedir())})).error`);
  if (!/^Access denied/.test(err ?? "")) throw new Error(`erro em inglês esperado, veio: ${err}`);
  return err.slice(0, 40);
});

// ---------- relatório ----------
console.log(`\n${results.length - failed}/${results.length} etapas OK`);
if (failed) {
  console.log("\nLog do processo main (fim):\n" + mainLog.split("\n").slice(-40).join("\n"));
}
if (process.env.E2E_KEEP) {
  console.log("E2E_KEEP: app aberto para inspeção (Ctrl+C encerra).");
  await new Promise(() => {});
}
cleanup();
await sleep(1500);
try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {
  /* arquivos presos pelo processo que acabou de fechar */
}
process.exit(failed ? 1 : 0);
