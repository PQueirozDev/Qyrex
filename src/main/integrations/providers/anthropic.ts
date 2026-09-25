import Anthropic from "@anthropic-ai/sdk";
import { providerNote, type AIProvider, type ModelListing } from "./types.js";
import { tm } from "../../../shared/i18n.js";
import { endpoints } from "../endpoints.js";

/**
 * Provider do Claude usando o SDK oficial `@anthropic-ai/sdk`.
 * Streaming via `client.messages.stream`, listagem via `client.models.list`.
 */

const DEFAULT_MAX_OUTPUT = 64_000;
const SERVER_FALLBACK_MODELS = /^claude-(opus-5|fable-5-1)$/;

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 2, baseURL: endpoints.anthropic() });
}

function describeError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new Error("Claude: API key inválida ou revogada.");
  if (err instanceof Anthropic.PermissionDeniedError) return new Error("Claude: a key não tem permissão para este modelo.");
  if (err instanceof Anthropic.NotFoundError) return new Error("Claude: modelo não encontrado para esta conta.");
  if (err instanceof Anthropic.RateLimitError) return new Error("Claude: limite de requisições atingido. Tente em instantes.");
  if (err instanceof Anthropic.APIConnectionError) return new Error("Claude: sem conexão com a API (verifique a internet).");
  if (err instanceof Anthropic.APIError) return new Error(`Claude (${err.status ?? "erro"}): ${err.message}`);
  return err instanceof Error ? err : new Error(String(err));
}

export const anthropicProvider: AIProvider = {
  defaultModel: "claude-opus-5",
  fallbackModels: [
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
  ],

  async streamChat({ apiKey, model, system, messages, signal, maxOutputTokens }, { onDelta, onUsage }) {
    try {
      const params = {
        model,
        max_tokens: Math.min(maxOutputTokens ?? DEFAULT_MAX_OUTPUT, DEFAULT_MAX_OUTPUT),
        ...(system ? { system } : {}),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      };
      // Em Opus 5 / Fable 5.1, se o modelo recusar por política, o servidor
      // refaz a mesma requisição num modelo de fallback dentro da mesma chamada.
      const stream = SERVER_FALLBACK_MODELS.test(model)
        ? client(apiKey).beta.messages.stream(
            { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" },
            { signal }
          )
        : client(apiKey).messages.stream(params, { signal });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          onDelta(event.delta.text);
        } else if (event.type === "message_start") {
          // Entrada (e cache) chegam no início; a saída é atualizada nos message_delta.
          const u = event.message.usage;
          onUsage?.({
            inputTokens: u.input_tokens,
            outputTokens: u.output_tokens,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
          });
        } else if (event.type === "message_delta") {
          onUsage?.({ outputTokens: event.usage.output_tokens });
        }
      }

      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        onDelta(providerNote(tm("O modelo recusou continuar esta resposta.")));
      } else if (final.stop_reason === "max_tokens") {
        onDelta(providerNote(tm("Resposta interrompida: limite de tokens de saída atingido.")));
      }
    } catch (err) {
      if (signal.aborted) throw err;
      throw describeError(err);
    }
  },

  async listModels(apiKey) {
    const models: ModelListing[] = [];
    for await (const m of client(apiKey).models.list({ limit: 100 })) {
      const info = m as typeof m & { max_tokens?: number };
      models.push({ id: m.id, label: m.display_name || m.id, maxOutputTokens: info.max_tokens });
    }
    return models;
  },

  async testConnection(apiKey) {
    try {
      await client(apiKey).models.list({ limit: 1 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: describeError(err).message };
    }
  },
};
