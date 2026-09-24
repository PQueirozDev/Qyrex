import { readApiError, readSse, type AIProvider } from "./types.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// A key vai no cabeçalho `x-goog-api-key` — nunca na query string, onde
// poderia acabar em logs de proxy/histórico.
function headers(apiKey: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-goog-api-key": apiKey };
}

function assertModelId(model: string): string {
  if (!/^[\w.-]+$/.test(model)) throw new Error("Identificador de modelo inválido.");
  return model;
}

export const googleProvider: AIProvider = {
  defaultModel: "gemini-2.5-pro",
  fallbackModels: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],

  async streamChat({ apiKey, model, system, messages, signal }, { onDelta }) {
    // A API do Gemini usa "model" em vez de "assistant" para o papel do modelo.
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const res = await fetch(`${BASE_URL}/models/${assertModelId(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal,
      headers: headers(apiKey),
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      }),
    });

    if (!res.ok || !res.body) throw new Error(await readApiError(res, "Gemini"));

    await readSse(res.body, (payload) => {
      let event: {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
        error?: { message?: string };
      };
      try {
        event = JSON.parse(payload);
      } catch {
        return;
      }
      if (event.error) throw new Error(`Gemini: ${event.error.message ?? "erro no stream"}`);
      const candidate = event.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (typeof part.text === "string" && !part.thought) onDelta(part.text);
      }
      if (candidate?.finishReason === "MAX_TOKENS") onDelta("\n\n_[Resposta interrompida: limite de tokens atingido.]_");
      if (candidate?.finishReason === "SAFETY") onDelta("\n\n_[Resposta bloqueada pelos filtros de segurança do Gemini.]_");
    });
  },

  async listModels(apiKey) {
    const res = await fetch(`${BASE_URL}/models?pageSize=200`, { headers: headers(apiKey) });
    if (!res.ok) throw new Error(await readApiError(res, "Gemini"));
    const body = (await res.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[]; outputTokenLimit?: number }[];
    };
    return (body.models ?? [])
      .filter((m) => m.name.includes("gemini") && m.supportedGenerationMethods?.includes("generateContent"))
      .filter((m) => !/(embedding|image|tts|audio|live)/i.test(m.name))
      .map((m) => ({
        id: m.name.replace(/^models\//, ""),
        label: m.displayName ?? m.name.replace(/^models\//, ""),
        maxOutputTokens: m.outputTokenLimit,
      }));
  },

  async testConnection(apiKey) {
    try {
      const res = await fetch(`${BASE_URL}/models?pageSize=1`, { headers: headers(apiKey) });
      if (res.ok) return { ok: true };
      return { ok: false, error: await readApiError(res, "Gemini") };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
