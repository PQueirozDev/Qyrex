import type { AIModelInfo } from "../../../shared/types.js";

export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
}

export interface TestResult {
  ok: boolean;
  error?: string;
}

export interface ModelListing extends AIModelInfo {
  /** Limite de tokens de saída informado pela API, quando disponível. */
  maxOutputTokens?: number;
}

/**
 * Contrato único que providers/anthropic, providers/openai e providers/google
 * implementam. A Central de IA (aiService.ts) só fala com esta interface —
 * adicionar um provider é um arquivo novo + uma linha no registro (index.ts).
 */
export interface AIProvider {
  /** Modelos usados quando a listagem pela API não está disponível (offline, erro). */
  readonly fallbackModels: AIModelInfo[];
  readonly defaultModel: string;

  streamChat(
    params: {
      apiKey: string;
      model: string;
      system?: string;
      messages: ProviderMessage[];
      signal: AbortSignal;
      maxOutputTokens?: number;
    },
    callbacks: StreamCallbacks
  ): Promise<void>;

  /** Lista modelos de chat disponíveis para a key (endpoint gratuito, não gera custo). */
  listModels(apiKey: string): Promise<ModelListing[]>;

  /** Testa a key sem gerar custo (usa o endpoint de listagem de modelos). */
  testConnection(apiKey: string): Promise<TestResult>;
}

/** Extrai uma mensagem de erro legível do corpo de erro de uma API REST. */
export async function readApiError(res: Response, provider: string): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string };
    const message = typeof body.error === "string" ? body.error : body.error?.message;
    if (message) return `${provider} (${res.status}): ${message}`;
  } catch {
    // corpo não-JSON
  }
  return `${provider} (${res.status}): ${text.slice(0, 300) || res.statusText}`;
}

/** Lê um corpo SSE (text/event-stream) e entrega o payload de cada linha `data:`. */
export async function readSse(body: ReadableStream<Uint8Array>, onData: (payload: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload) onData(payload);
    }
  }
  const rest = buffer.trim();
  if (rest.startsWith("data:")) onData(rest.slice(5).trim());
}
