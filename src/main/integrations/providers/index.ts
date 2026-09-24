import type { AIProviderId } from "../../../shared/types.js";
import type { AIProvider } from "./types.js";
import { anthropicProvider } from "./anthropic.js";
import { openaiProvider } from "./openai.js";
import { googleProvider } from "./google.js";

export const PROVIDERS: Record<AIProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
};

export const PROVIDER_LABELS: Record<AIProviderId, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Gemini",
};

export function getProvider(id: AIProviderId): AIProvider {
  return PROVIDERS[id];
}
