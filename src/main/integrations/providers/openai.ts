import { readApiError, readSse, type AIProvider } from "./types.js";

const BASE_URL = "https://api.openai.com/v1";

/** Modelos da listagem que NÃO são de chat (áudio, imagem, embeddings...). */
const NON_CHAT = /(embedding|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search|davinci|babbage|instruct|computer-use|codex-mini-latest|sora)/i;

export const openaiProvider: AIProvider = {
  defaultModel: "gpt-5",
  fallbackModels: [
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
  ],

  async streamChat({ apiKey, model, system, messages, signal }, { onDelta }) {
    const fullMessages = system ? [{ role: "system", content: system }, ...messages] : messages;

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, stream: true, messages: fullMessages }),
    });

    if (!res.ok || !res.body) throw new Error(await readApiError(res, "OpenAI"));

    await readSse(res.body, (payload) => {
      if (payload === "[DONE]") return;
      let event: { choices?: { delta?: { content?: string }; finish_reason?: string }[]; error?: { message?: string } };
      try {
        event = JSON.parse(payload);
      } catch {
        return;
      }
      if (event.error) throw new Error(`OpenAI: ${event.error.message ?? "erro no stream"}`);
      const delta = event.choices?.[0]?.delta?.content;
      if (typeof delta === "string") onDelta(delta);
      if (event.choices?.[0]?.finish_reason === "length") {
        onDelta("\n\n_[Resposta interrompida: limite de tokens atingido.]_");
      }
    });
  },

  async listModels(apiKey) {
    const res = await fetch(`${BASE_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(await readApiError(res, "OpenAI"));
    const body = (await res.json()) as { data: { id: string; created: number }[] };
    return body.data
      .filter((m) => /^(gpt-|o\d|chatgpt-)/i.test(m.id) && !NON_CHAT.test(m.id))
      .sort((a, b) => b.created - a.created)
      .map((m) => ({ id: m.id, label: m.id }));
  },

  async testConnection(apiKey) {
    try {
      const res = await fetch(`${BASE_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (res.ok) return { ok: true };
      return { ok: false, error: await readApiError(res, "OpenAI") };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
