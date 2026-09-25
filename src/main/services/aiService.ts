import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { getDb, getSettings } from "../database/db.js";
import { deleteSecret, getSecret, hasSecret, maskKey, saveSecret } from "../security/secrets.js";
import { getProvider, PROVIDERS, PROVIDER_LABELS } from "../integrations/providers/index.js";
import type { ModelListing, ProviderMessage, ProviderUsage } from "../integrations/providers/types.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { readTextFile } from "./fileService.js";
import { getProject } from "./projectService.js";
import { getIntegrationMetadata, setIntegrationState } from "./integrationsService.js";
import { createLogger } from "../logger.js";
import { estimateTokens, recordUsage } from "./usageService.js";
import type {
  AIConversation,
  AIMessage,
  AIProviderId,
  AIProviderStatus,
  AttachedFileRef,
  AIStreamChunk,
  AIUsageSource,
} from "../../shared/types.js";
import { tt } from "../i18n.js";
import { CLI_MODELS, cliStatus, streamViaCli, type SubscriptionCli } from "../integrations/cli/subscriptions.js";
import type { SubscriptionCliStatus } from "../../shared/types.js";

const log = createLogger("ai");

// Requisições de streaming em andamento, para permitir "Interromper geração".
const activeRequests = new Map<string, AbortController>();
// Cache em memória da listagem de modelos (evita requests repetidos).
const modelCache = new Map<AIProviderId, ModelListing[]>();

interface ConversationRow {
  id: string;
  title: string;
  provider: string;
  model: string;
  project_id: string | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  attached_files: string;
  created_at: string;
}

function rowToConversation(row: ConversationRow): AIConversation {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider as AIProviderId,
    model: row.model,
    projectId: row.project_id,
    createdAt: row.created_at,
  };
}

function rowToMessage(row: MessageRow): AIMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as AIMessage["role"],
    content: row.content,
    attachedFiles: JSON.parse(row.attached_files) as AttachedFileRef[],
    createdAt: row.created_at,
  };
}

// --- Providers / chaves ------------------------------------------------------------

// --- Assinatura (Claude Code / Codex CLI) -------------------------------------------

const SUBSCRIPTION_CLI: Partial<Record<AIProviderId, SubscriptionCli>> = { anthropic: "claude", openai: "codex" };

/** CLI de assinatura em uso pelo provider, ou null se ele usa API key. */
function subscriptionCli(provider: AIProviderId): SubscriptionCli | null {
  const cli = SUBSCRIPTION_CLI[provider];
  return cli && getIntegrationMetadata(provider).authMode === "subscription" ? cli : null;
}

/** Conectado por API key salva OU pela assinatura. */
export function isProviderConnected(provider: AIProviderId): boolean {
  return subscriptionCli(provider) !== null || hasSecret(provider);
}

function assertConnected(provider: AIProviderId): void {
  if (!isProviderConnected(provider)) {
    throw new Error(tt("{name} não está conectado. Conecte em Integrações.", { name: PROVIDER_LABELS[provider] }));
  }
}

export async function listSubscriptionClis(): Promise<SubscriptionCliStatus[]> {
  const entries = Object.entries(SUBSCRIPTION_CLI) as ["anthropic" | "openai", SubscriptionCli][];
  return Promise.all(
    entries.map(async ([provider, cli]) => {
      const st = await cliStatus(cli);
      return { provider, cli, installed: st.installed, loggedIn: st.loggedIn, account: st.account };
    })
  );
}

/** Conecta o provider pela assinatura: exige a CLI oficial instalada e logada. */
export async function connectSubscription(provider: AIProviderId): Promise<{ ok: boolean; error?: string; account?: string | null }> {
  const cli = SUBSCRIPTION_CLI[provider];
  if (!cli) return { ok: false, error: tt("Este provider não tem conexão por assinatura.") };
  const st = await cliStatus(cli);
  const name = cli === "claude" ? "Claude Code" : "Codex CLI";
  if (!st.installed) return { ok: false, error: tt("{name} não está instalado neste PC.", { name }) };
  if (!st.loggedIn) {
    return {
      ok: false,
      error: tt("{name} não está logado. Abra um terminal e rode: {command}", { name, command: cli === "claude" ? "claude" : "codex login" }),
    };
  }
  setIntegrationState(provider, "connected", { authMode: "subscription", account: st.account ?? name, maskedKey: undefined, lastError: undefined });
  log.info(`${provider} conectado pela assinatura (${name})`);
  return { ok: true, account: st.account };
}

export function listProviderStatus(): AIProviderStatus[] {
  return (Object.keys(PROVIDERS) as AIProviderId[]).map((id) => {
    const provider = PROVIDERS[id];
    const cli = subscriptionCli(id);
    const meta = getIntegrationMetadata(id);
    if (cli) {
      return {
        id,
        label: PROVIDER_LABELS[id],
        connected: true,
        authMode: "subscription" as const,
        account: meta.account ?? null,
        maskedKey: null,
        models: CLI_MODELS[cli].models.map((m) => ({ id: m.id, label: tt(m.label) })),
        defaultModel: CLI_MODELS[cli].defaultModel,
      };
    }
    const cached = modelCache.get(id);
    return {
      id,
      label: PROVIDER_LABELS[id],
      connected: hasSecret(id),
      authMode: "key" as const,
      account: null,
      maskedKey: meta.maskedKey ?? null,
      models: cached?.length ? cached.map(({ id: mid, label }) => ({ id: mid, label })) : provider.fallbackModels,
      defaultModel: provider.defaultModel,
    };
  });
}

/** Busca a lista real de modelos da conta (endpoint gratuito). Falha silenciosamente para o fallback. */
export async function refreshModels(provider: AIProviderId): Promise<AIProviderStatus[]> {
  const apiKey = getSecret(provider);
  if (!apiKey) return listProviderStatus();
  try {
    const models = await getProvider(provider).listModels(apiKey);
    if (models.length > 0) modelCache.set(provider, models);
  } catch (err) {
    log.warn(`Não foi possível listar modelos de ${provider}:`, err);
  }
  return listProviderStatus();
}

export async function connectProvider(provider: AIProviderId, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const key = apiKey.trim();
  const result = await getProvider(provider).testConnection(key);
  if (!result.ok) {
    // Se já existe uma key salva, ela continua valendo: só a nova foi recusada.
    if (!hasSecret(provider)) setIntegrationState(provider, "error", { lastError: result.error });
    log.warn(`Falha ao conectar ${provider}`);
    return { ok: false, error: result.error };
  }
  saveSecret(provider, key);
  setIntegrationState(provider, "connected", { authMode: "key", account: undefined, maskedKey: maskKey(key), lastError: undefined });
  log.info(`${provider} conectado`);
  await refreshModels(provider);
  return { ok: true };
}

export function disconnectProvider(provider: AIProviderId): void {
  deleteSecret(provider);
  modelCache.delete(provider);
  setIntegrationState(provider, "disconnected", {}, false);
  log.info(`${provider} desconectado`);
}

export async function testProvider(provider: AIProviderId): Promise<{ ok: boolean; error?: string }> {
  if (subscriptionCli(provider)) {
    const res = await connectSubscription(provider);
    if (!res.ok) setIntegrationState(provider, "error", { lastError: res.error });
    return { ok: res.ok, error: res.error };
  }
  const apiKey = getSecret(provider);
  if (!apiKey) return { ok: false, error: "Nenhuma API key salva para este provider." };
  const result = await getProvider(provider).testConnection(apiKey);
  setIntegrationState(provider, result.ok ? "connected" : "error", { lastError: result.ok ? undefined : result.error });
  return result;
}

// --- Conversas --------------------------------------------------------------------

export function listConversations(projectId?: string): AIConversation[] {
  const rows = projectId
    ? (getDb()
        .prepare("SELECT * FROM ai_conversations WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId) as ConversationRow[])
    : (getDb().prepare("SELECT * FROM ai_conversations ORDER BY created_at DESC").all() as ConversationRow[]);
  return rows.map(rowToConversation);
}

function getConversation(id: string): AIConversation {
  const row = getDb().prepare("SELECT * FROM ai_conversations WHERE id = ?").get(id) as ConversationRow | undefined;
  if (!row) throw new Error("Conversa não encontrada.");
  return rowToConversation(row);
}

export function createConversation(input: {
  title: string;
  provider: AIProviderId;
  model: string;
  projectId?: string;
}): AIConversation {
  if (input.projectId && !getProject(input.projectId)) throw new Error("Projeto não encontrado.");
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO ai_conversations (id, title, provider, model, project_id, created_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
    )
    .run(id, input.title, input.provider, input.model, input.projectId ?? null);
  return getConversation(id);
}

export function updateConversation(
  id: string,
  partial: { title?: string; model?: string; provider?: AIProviderId }
): AIConversation {
  const current = getConversation(id);
  const merged = { ...current, ...partial };
  getDb()
    .prepare("UPDATE ai_conversations SET title = ?, model = ?, provider = ? WHERE id = ?")
    .run(merged.title, merged.model, merged.provider, id);
  return getConversation(id);
}

export function deleteConversation(id: string): void {
  getDb().prepare("DELETE FROM ai_conversations WHERE id = ?").run(id);
}

export function listMessages(conversationId: string): AIMessage[] {
  const rows = getDb()
    .prepare("SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(conversationId) as MessageRow[];
  return rows.map(rowToMessage);
}

function insertMessage(
  conversationId: string,
  role: AIMessage["role"],
  content: string,
  attachedFiles: AttachedFileRef[] = []
): AIMessage {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO ai_messages (id, conversation_id, role, content, attached_files, created_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
    )
    .run(id, conversationId, role, content, JSON.stringify(attachedFiles));
  return rowToMessage(getDb().prepare("SELECT * FROM ai_messages WHERE id = ?").get(id) as MessageRow);
}

// --- Contexto ------------------------------------------------------------------------

/**
 * Monta o bloco de contexto de arquivos que vai junto da mensagem do usuário.
 * Só entram arquivos que o próprio usuário selecionou explicitamente na UI —
 * "Nunca envie todo o computador ou projeto automaticamente".
 */
export function buildFileContext(files: AttachedFileRef[]): string {
  if (files.length === 0) return "";
  const blocks = files.map((f) => {
    const resolved = assertPathAllowedAndExists(f.path);
    return `--- Arquivo: ${f.name} ---\n${readTextFile(resolved, 60_000)}`;
  });
  return `\n\nArquivos anexados pelo usuário para contexto:\n\n${blocks.join("\n\n")}`;
}

function systemPrompt(projectId: string | null): string {
  const lines = [
    "Você é um assistente dentro do QrzSpace, a central de trabalho de um desenvolvedor que cria sites, automações, bots e marketing para Instagram.",
    getSettings().language === "en"
      ? "Answer in English unless the user writes in or asks for another language."
      : "Responda em português do Brasil, a menos que o usuário peça outro idioma.",
    "Quando sugerir comandos de terminal, coloque cada um num bloco de código ```powershell separado. Você não executa comandos: o usuário decide se executa, e comandos destrutivos exigem confirmação dele.",
  ];
  const project = projectId ? getProject(projectId) : null;
  if (project) {
    lines.push(
      `Projeto atual: ${project.name}${project.technologies.length ? ` (${project.technologies.join(", ")})` : ""}.`,
      "Você só vê os arquivos que o usuário anexar explicitamente em cada mensagem."
    );
  }
  return lines.join("\n");
}

function historyForProvider(messages: AIMessage[], lastUserContext: { id: string; extra: string } | null): ProviderMessage[] {
  return messages
    .filter((m): m is AIMessage & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: lastUserContext && m.id === lastUserContext.id ? m.content + lastUserContext.extra : m.content,
    }));
}

// --- Streaming -------------------------------------------------------------------------

function emit(sender: WebContents, chunk: AIStreamChunk): void {
  if (!sender.isDestroyed()) sender.send("ai:stream", chunk);
}

/**
 * Executa um stream contra um provider e emite deltas via IPC (`ai:stream`).
 * Retorna o texto completo (ou parcial, se interrompido).
 */
async function runStream(
  sender: WebContents,
  requestId: string,
  provider: AIProviderId,
  model: string,
  system: string,
  messages: ProviderMessage[],
  meta: { source: AIUsageSource; conversationId?: string | null }
): Promise<{ text: string; aborted: boolean }> {
  const cli = subscriptionCli(provider);
  const apiKey = cli ? null : getSecret(provider);
  if (!cli && !apiKey) throw new Error(tt("Nenhuma API key configurada para {name}. Conecte em Integrações.", { name: PROVIDER_LABELS[provider] }));
  // Pela assinatura não há custo por token: o modelo é registrado com prefixo da CLI (sem preço de tabela).
  let usageModel = cli ? `${cli === "claude" ? "claude-code" : "codex"}/${model}` : model;

  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  let text = "";
  let aborted = false;
  let reported = false;
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  try {
    const callbacks = {
      onDelta: (delta: string) => {
        text += delta;
        emit(sender, { requestId, type: "delta", text: delta });
      },
      onUsage: (u: ProviderUsage) => {
        reported = true;
        if (u.inputTokens !== undefined) usage.inputTokens = u.inputTokens;
        if (u.outputTokens !== undefined) usage.outputTokens = u.outputTokens;
        if (u.cacheReadTokens !== undefined) usage.cacheReadTokens = u.cacheReadTokens;
        if (u.cacheWriteTokens !== undefined) usage.cacheWriteTokens = u.cacheWriteTokens;
      },
    };
    if (cli) {
      await streamViaCli(cli, { model, system, messages, signal: controller.signal }, {
        ...callbacks,
        onModel: (m) => {
          usageModel = `${cli === "claude" ? "claude-code" : "codex"}/${m}`;
        },
      });
    } else {
      const maxOutputTokens = modelCache.get(provider)?.find((m) => m.id === model)?.maxOutputTokens;
      await getProvider(provider).streamChat({ apiKey: apiKey!, model, system, messages, signal: controller.signal, maxOutputTokens }, callbacks);
    }
    return { text, aborted: false };
  } catch (err) {
    if (controller.signal.aborted) {
      aborted = true;
      return { text, aborted: true };
    }
    throw err;
  } finally {
    activeRequests.delete(requestId);
    // Registra o uso mesmo se a geração foi interrompida (o provider cobra o que gerou).
    try {
      const estimated = !reported || (usage.outputTokens === 0 && text.length > 0);
      if (!reported) usage.inputTokens = estimateTokens(system + messages.map((m) => m.content).join("\n"));
      if (usage.outputTokens === 0 && text.length > 0) usage.outputTokens = estimateTokens(text);
      if (text.length > 0 || reported) {
        recordUsage({ provider, model: usageModel, source: meta.source, conversationId: meta.conversationId, usage, estimated, aborted });
      }
    } catch (err) {
      log.warn("Não foi possível registrar o uso da IA:", err);
    }
  }
}

function autoTitle(content: string): string {
  const firstLine = content.trim().split(/\r?\n/)[0] ?? "";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine || "Nova conversa";
}

async function streamIntoConversation(
  sender: WebContents,
  requestId: string,
  conversation: AIConversation,
  lastUser: { id: string; extra: string } | null
): Promise<void> {
  try {
    const messages = historyForProvider(listMessages(conversation.id), lastUser);
    const { text } = await runStream(
      sender,
      requestId,
      conversation.provider,
      conversation.model,
      systemPrompt(conversation.projectId),
      messages,
      { source: "chat", conversationId: conversation.id }
    );
    if (text.trim().length > 0) insertMessage(conversation.id, "assistant", text);
    emit(sender, { requestId, type: "done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Erro no stream (${conversation.provider}/${conversation.model}):`, message);
    emit(sender, { requestId, type: "error", error: message });
  }
}

export interface SendMessageInput {
  conversationId: string;
  content: string;
  attachedFiles?: AttachedFileRef[];
}

/**
 * Salva a mensagem do usuário e dispara o streaming em segundo plano.
 * Erros de validação (conversa inexistente, arquivo fora da allowlist, key
 * ausente) são lançados ANTES de qualquer request, para voltarem ao renderer.
 */
export function sendMessage(sender: WebContents, requestId: string, input: SendMessageInput): void {
  const conversation = getConversation(input.conversationId);
  assertConnected(conversation.provider);
  const attachedFiles = input.attachedFiles ?? [];
  const fileContext = buildFileContext(attachedFiles);

  const isFirst = listMessages(conversation.id).length === 0;
  const userMessage = insertMessage(conversation.id, "user", input.content, attachedFiles);
  if (isFirst) updateConversation(conversation.id, { title: autoTitle(input.content) });

  void streamIntoConversation(sender, requestId, conversation, { id: userMessage.id, extra: fileContext });
}

/** Remove a última resposta da IA e gera outra para a mesma pergunta (sem duplicar a pergunta). */
export function regenerate(sender: WebContents, requestId: string, conversationId: string): void {
  const conversation = getConversation(conversationId);
  const messages = listMessages(conversationId);
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  if (lastUserIndex === -1) throw new Error("Não há mensagem para regenerar.");

  const toRemove = messages.slice(lastUserIndex + 1).map((m) => m.id);
  const del = getDb().prepare("DELETE FROM ai_messages WHERE id = ?");
  getDb().transaction(() => toRemove.forEach((id) => del.run(id)))();

  const lastUser = messages[lastUserIndex];
  void streamIntoConversation(sender, requestId, conversation, {
    id: lastUser.id,
    extra: buildFileContext(lastUser.attachedFiles),
  });
}

export function interruptRequest(requestId: string): void {
  activeRequests.get(requestId)?.abort();
}

// --- AI Council ---------------------------------------------------------------------------

/**
 * Envia a MESMA pergunta para vários providers em paralelo. O handler IPC exige
 * que `confirmedCount` (quantos providers o usuário confirmou no diálogo de custo)
 * seja igual ao número de alvos — nunca dispara mais requisições do que o usuário viu.
 */
export function runCouncil(
  sender: WebContents,
  input: {
    prompt: string;
    targets: { provider: AIProviderId; model: string; requestId: string }[];
    attachedFiles?: AttachedFileRef[];
  }
): void {
  const providers = new Set(input.targets.map((t) => t.provider));
  if (providers.size !== input.targets.length) throw new Error("Cada provider só pode aparecer uma vez no Council.");
  for (const t of input.targets) assertConnected(t.provider);
  const content = input.prompt + buildFileContext(input.attachedFiles ?? []);
  const system = systemPrompt(null);

  for (const target of input.targets) {
    void runStream(sender, target.requestId, target.provider, target.model, system, [{ role: "user", content }], { source: "council" })
      .then(() => emit(sender, { requestId: target.requestId, type: "done" }))
      .catch((err: unknown) =>
        emit(sender, { requestId: target.requestId, type: "error", error: err instanceof Error ? err.message : String(err) })
      );
  }
  log.info(`AI Council disparado para ${input.targets.length} provider(s)`);
}

export function synthesizeCouncil(
  sender: WebContents,
  input: {
    requestId: string;
    provider: AIProviderId;
    model: string;
    prompt: string;
    answers: { label: string; content: string }[];
  }
): void {
  assertConnected(input.provider);
  const answers = input.answers.map((a) => `### Resposta de ${a.label}\n\n${a.content}`).join("\n\n");
  const content = [
    `Pergunta original do usuário:\n\n${input.prompt}`,
    `Abaixo estão respostas de diferentes modelos de IA para essa pergunta.\n\n${answers}`,
    "Sintetize essas respostas numa única resposta final: destaque onde concordam, aponte divergências e erros, e recomende o melhor caminho. Seja objetivo.",
  ].join("\n\n---\n\n");

  void runStream(sender, input.requestId, input.provider, input.model, systemPrompt(null), [{ role: "user", content }], {
    source: "synthesis",
  })
    .then(() => emit(sender, { requestId: input.requestId, type: "done" }))
    .catch((err: unknown) =>
      emit(sender, { requestId: input.requestId, type: "error", error: err instanceof Error ? err.message : String(err) })
    );
}
