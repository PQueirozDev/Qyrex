import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCapture, runLines } from "../../security/exec.js";
import { tm } from "../../../shared/i18n.js";
import { tt } from "../../i18n.js";
import type { AIModelInfo } from "../../../shared/types.js";
import type { ProviderMessage, ProviderUsage, StreamCallbacks } from "../providers/types.js";

/**
 * "Usar minha assinatura": em vez de API key, o QrzSpace conversa através das
 * CLIs oficiais que o usuário já instalou e logou no PC:
 *   - Claude Code (`claude`), logado com a conta do Claude (Pro/Max);
 *   - Codex CLI (`codex`), logado com a conta do ChatGPT.
 *
 * O QrzSpace nunca lê nem guarda o login dessas contas: só executa o binário
 * oficial, que usa a própria sessão. Regras de segurança:
 *   - spawn do .exe real com argumentos em array (sem shell);
 *   - TODAS as ferramentas desligadas (a IA não lê arquivos, não roda
 *     comandos, não acessa MCP/plugins) — ela só responde texto;
 *   - pasta de trabalho vazia e temporária; sessão não é salva em disco;
 *   - o texto vai por stdin, nunca montado numa linha de comando.
 */

export type SubscriptionCli = "claude" | "codex";

export interface CliStatus {
  installed: boolean;
  loggedIn: boolean;
  /** E-mail/plano (Claude) ou "ChatGPT" (Codex), só para exibir. */
  account: string | null;
  error?: string;
}

function firstExisting(candidates: string[]): string | null {
  for (const c of candidates) {
    try {
      if (c && fs.statSync(c).isFile()) return c;
    } catch {
      // não existe
    }
  }
  return null;
}

function onPath(exe: string): string[] {
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, exe));
}

const appData = () => process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");

export function findClaudeCode(): string | null {
  return firstExisting([
    path.join(os.homedir(), ".local", "bin", "claude.exe"),
    path.join(appData(), "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
    ...onPath("claude.exe"),
  ]);
}

export function findCodex(): string | null {
  const vendor = (arch: string, triple: string) =>
    path.join(appData(), "npm", "node_modules", "@openai", "codex", "node_modules", "@openai", `codex-win32-${arch}`, "vendor", triple, "bin", "codex.exe");
  return firstExisting([vendor("x64", "x86_64-pc-windows-msvc"), vendor("arm64", "aarch64-pc-windows-msvc"), ...onPath("codex.exe")]);
}

export const find = (cli: SubscriptionCli) => (cli === "claude" ? findClaudeCode() : findCodex());

/** Ambiente do processo filho, sem variáveis do Electron que mudam o comportamento de binários Node. */
export function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CLAUDECODE;
  return env;
}

/** Pasta vazia onde a CLI roda (ela não tem ferramentas, mas nem o cwd tem nada). */
export function scratchDir(): string {
  const dir = path.join(os.tmpdir(), "qrzspace-ai");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function cliStatus(cli: SubscriptionCli): Promise<CliStatus> {
  const exe = find(cli);
  if (!exe) return { installed: false, loggedIn: false, account: null };
  try {
    if (cli === "claude") {
      const res = await runCapture(exe, ["auth", "status"], { timeoutMs: 20_000, env: childEnv(), cwd: scratchDir() });
      const info = JSON.parse(res.stdout.trim() || "{}") as { loggedIn?: boolean; email?: string; subscriptionType?: string };
      const plan = info.subscriptionType ? ` (${info.subscriptionType})` : "";
      return { installed: true, loggedIn: Boolean(info.loggedIn), account: info.email ? `${info.email}${plan}` : null };
    }
    const res = await runCapture(exe, ["login", "status"], { timeoutMs: 20_000, env: childEnv(), cwd: scratchDir() });
    const out = `${res.stdout}\n${res.stderr}`;
    const loggedIn = res.code === 0 && /logged in/i.test(out);
    return { installed: true, loggedIn, account: loggedIn ? (/chatgpt/i.test(out) ? "ChatGPT" : out.trim().split(/\r?\n/)[0]) : null };
  } catch (err) {
    return { installed: true, loggedIn: false, account: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export const CLI_MODELS: Record<SubscriptionCli, { defaultModel: string; models: AIModelInfo[] }> = {
  claude: {
    defaultModel: "default",
    models: [
      { id: "default", label: tm("Padrão do Claude Code") },
      { id: "opus", label: "Opus" },
      { id: "sonnet", label: "Sonnet" },
      { id: "haiku", label: "Haiku" },
    ],
  },
  codex: {
    defaultModel: "default",
    models: [{ id: "default", label: tm("Padrão do Codex") }],
  },
};

/** Histórico em texto: a CLI recebe uma única entrada por execução. */
export function transcript(messages: ProviderMessage[]): string {
  if (messages.length === 1) return messages[0].content;
  const last = messages[messages.length - 1];
  const before = messages
    .slice(0, -1)
    .map((m) => `[${m.role === "user" ? "Usuário" : "Assistente"}]\n${m.content}`)
    .join("\n\n");
  return `Histórico desta conversa (você é o Assistente):\n\n${before}\n\n---\n\nNova mensagem do usuário:\n\n${last.content}`;
}

// --- Leitura da saída JSONL -----------------------------------------------------------------

export interface CliEvent {
  delta?: string;
  usage?: ProviderUsage;
  model?: string;
  error?: string;
}

interface ClaudeLine {
  type?: string;
  model?: string;
  is_error?: boolean;
  result?: string;
  subtype?: string;
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
    message?: { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
    usage?: { output_tokens?: number };
  };
}

/** Uma linha do `claude -p --output-format stream-json --include-partial-messages`. */
export function parseClaudeCodeLine(line: string): CliEvent {
  let data: ClaudeLine;
  try {
    data = JSON.parse(line) as ClaudeLine;
  } catch {
    return {};
  }
  if (data.type === "system" && data.model) return { model: data.model };
  if (data.type === "result") return data.is_error ? { error: data.result || data.subtype || "erro" } : {};
  if (data.type !== "stream_event" || !data.event) return {};
  const ev = data.event;
  if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && typeof ev.delta.text === "string") return { delta: ev.delta.text };
  if (ev.type === "message_start" && ev.message?.usage) {
    const u = ev.message.usage;
    return {
      usage: {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      },
    };
  }
  if (ev.type === "message_delta" && ev.usage?.output_tokens !== undefined) return { usage: { outputTokens: ev.usage.output_tokens } };
  return {};
}

interface CodexLine {
  type?: string;
  message?: string;
  error?: { message?: string };
  item?: { id?: string; type?: string; text?: string };
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
}

/**
 * Leitor do `codex exec --json`. Mantém o texto já emitido por item para
 * entregar só o trecho novo (item.updated / item.completed).
 */
export function createCodexParser(): (line: string) => CliEvent {
  const seen = new Map<string, string>();
  let messages = 0;
  return (line) => {
    let data: CodexLine;
    try {
      data = JSON.parse(line) as CodexLine;
    } catch {
      return {};
    }
    if (data.type === "turn.failed") return { error: data.error?.message ?? "erro" };
    if (data.type === "error") return { error: data.message ?? "erro" };
    if (data.type === "turn.completed" && data.usage) {
      const cached = data.usage.cached_input_tokens ?? 0;
      return { usage: { inputTokens: Math.max(0, (data.usage.input_tokens ?? 0) - cached), cacheReadTokens: cached, outputTokens: data.usage.output_tokens ?? 0 } };
    }
    const item = data.item;
    if ((data.type === "item.updated" || data.type === "item.completed") && item?.type === "agent_message" && typeof item.text === "string") {
      const id = item.id ?? String(messages);
      const previous = seen.get(id);
      if (previous === undefined) messages++;
      const already = previous ?? "";
      seen.set(id, item.text);
      const sep = previous === undefined && messages > 1 ? "\n\n" : "";
      return item.text.startsWith(already) ? { delta: sep + item.text.slice(already.length) } : {};
    }
    return {};
  };
}

// --- Execução ---------------------------------------------------------------------------------

const CODEX_DISABLED_FEATURES = [
  "shell_tool",
  "unified_exec",
  "apps",
  "plugins",
  "browser_use",
  "browser_use_external",
  "in_app_browser",
  "computer_use",
  "code_mode_host",
];

export function cliArgs(cli: SubscriptionCli, model: string, system: string, cwd: string): string[] {
  if (cli === "claude") {
    return [
      "-p",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--tools", "",
      "--strict-mcp-config",
      "--setting-sources", "",
      "--no-session-persistence",
      "--system-prompt", system,
      ...(model && model !== "default" ? ["--model", model] : []),
    ];
  }
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    ...CODEX_DISABLED_FEATURES.flatMap((f) => ["--disable", f]),
    "--cd", cwd,
    ...(model && model !== "default" ? ["--model", model] : []),
    "-",
  ];
}

/** Erros comuns das CLIs em mensagens que o usuário entende. */
function friendlyError(cli: SubscriptionCli, raw: string): string {
  const text = raw.trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 400);
  if (/login|log in|not logged|authenticat|invalid api key|401/i.test(text)) {
    return cli === "claude" ? tt("Claude Code não está logado. Abra o terminal e rode: claude") : tt("Codex não está logado. Abra o terminal e rode: codex login");
  }
  return `${cli === "claude" ? "Claude Code" : "Codex"}: ${text || "erro"}`;
}

export async function streamViaCli(
  cli: SubscriptionCli,
  params: { model: string; system?: string; messages: ProviderMessage[]; signal: AbortSignal },
  callbacks: StreamCallbacks & { onModel?: (model: string) => void }
): Promise<void> {
  const exe = find(cli);
  if (!exe) throw new Error(cli === "claude" ? tt("Claude Code não encontrado neste PC.") : tt("Codex CLI não encontrado neste PC."));
  const cwd = scratchDir();
  const system = params.system ?? "";
  // O Codex não tem opção de system prompt no exec: as instruções vão no começo da entrada.
  const input = cli === "claude" ? transcript(params.messages) : `${system ? `Instruções:\n${system}\n\n---\n\n` : ""}${transcript(params.messages)}`;
  const parse = cli === "claude" ? parseClaudeCodeLine : createCodexParser();
  let error: string | null = null;
  let gotText = false;

  const res = await runLines(exe, cliArgs(cli, params.model, system, cwd), {
    cwd,
    env: childEnv(),
    input,
    signal: params.signal,
    timeoutMs: 10 * 60_000,
    onLine: (line) => {
      const ev = parse(line);
      if (ev.model) callbacks.onModel?.(ev.model);
      if (ev.usage) callbacks.onUsage?.(ev.usage);
      if (ev.delta) {
        gotText = true;
        callbacks.onDelta(ev.delta);
      }
      if (ev.error) error = ev.error;
    },
  });
  if (params.signal.aborted) throw new Error(tt("Interrompido."));
  if (error) throw new Error(friendlyError(cli, error));
  if (res.code !== 0 && !gotText) throw new Error(friendlyError(cli, res.stderr || `código ${res.code}`));
}
