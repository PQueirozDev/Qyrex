import { create } from "zustand";
import type { AIConversation, AIMessage, AIProviderId, AIProviderStatus, AIStreamChunk, AttachedFileRef } from "@shared/types";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { tr } from "@/lib/i18n";

/**
 * Um único listener de `ai:stream` para o app inteiro, que despacha cada chunk
 * para quem registrou aquele requestId (chat normal ou AI Council).
 */
type StreamHandler = (chunk: AIStreamChunk) => void;
const streamHandlers = new Map<string, StreamHandler>();
let streamSubscribed = false;

export function onStreamRequest(requestId: string, handler: StreamHandler): () => void {
  if (!streamSubscribed) {
    window.workspace.ai.onStream((chunk) => streamHandlers.get(chunk.requestId)?.(chunk));
    streamSubscribed = true;
  }
  streamHandlers.set(requestId, handler);
  return () => streamHandlers.delete(requestId);
}

interface AIState {
  providers: AIProviderStatus[];
  conversations: AIConversation[];
  activeConversationId: string | null;
  messages: AIMessage[];
  streamingText: string;
  isStreaming: boolean;
  activeRequestId: string | null;
  error: string | null;
  /**
   * Texto a colocar na caixa de mensagem de uma conversa (ex.: página do Notion).
   * Fica amarrado à conversa e só sai quando a mensagem é enviada.
   */
  pendingDraft: { conversationId: string; text: string } | null;
  setPendingDraft: (draft: { conversationId: string; text: string } | null) => void;

  loadProviders: () => Promise<void>;
  refreshModels: (provider: AIProviderId) => Promise<void>;
  loadConversations: () => Promise<void>;
  createConversation: (input: { provider: AIProviderId; model: string; projectId?: string }) => Promise<string | null>;
  updateConversation: (id: string, patch: { title?: string; model?: string; provider?: AIProviderId }) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  selectConversation: (id: string | null) => Promise<void>;
  sendMessage: (content: string, attachedFiles?: AttachedFileRef[]) => Promise<void>;
  regenerate: () => Promise<void>;
  interrupt: () => Promise<void>;
}

export const useAIStore = create<AIState>((set, get) => {
  function startStream(requestId: string, conversationId: string) {
    set({ isStreaming: true, streamingText: "", activeRequestId: requestId, error: null });
    const unsubscribe = onStreamRequest(requestId, (chunk) => {
      if (chunk.type === "delta") {
        set({ streamingText: get().streamingText + (chunk.text ?? "") });
        return;
      }
      unsubscribe();
      set({
        isStreaming: false,
        activeRequestId: null,
        error: chunk.type === "error" ? chunk.error ?? tr("Erro na IA.") : null,
      });
      if (get().activeConversationId === conversationId) {
        void window.workspace.ai.messages.list(conversationId).then((res) => {
          if (res.ok) set({ messages: res.data, streamingText: "" });
        });
      }
      void get().loadConversations();
    });
    return unsubscribe;
  }

  return {
    providers: [],
    conversations: [],
    activeConversationId: null,
    messages: [],
    streamingText: "",
    isStreaming: false,
    activeRequestId: null,
    error: null,
    pendingDraft: null,
    setPendingDraft: (draft) => set({ pendingDraft: draft }),

    loadProviders: async () => {
      const data = await attempt(window.workspace.ai.providers());
      if (data) set({ providers: data });
    },
    refreshModels: async (provider) => {
      const data = await attempt(window.workspace.ai.refreshModels(provider));
      if (data) set({ providers: data });
    },
    loadConversations: async () => {
      const data = await attempt(window.workspace.ai.conversations.list());
      if (data) set({ conversations: data });
    },
    createConversation: async (input) => {
      const conv = await attempt(window.workspace.ai.conversations.create({ title: tr("Nova conversa"), ...input }));
      if (!conv) return null;
      await get().loadConversations();
      await get().selectConversation(conv.id);
      return conv.id;
    },
    updateConversation: async (id, patch) => {
      await attempt(window.workspace.ai.conversations.update(id, patch));
      await get().loadConversations();
    },
    deleteConversation: async (id) => {
      await attempt(window.workspace.ai.conversations.delete(id));
      if (get().activeConversationId === id) set({ activeConversationId: null, messages: [] });
      await get().loadConversations();
    },
    selectConversation: async (id) => {
      set({ activeConversationId: id, messages: [], streamingText: "", error: null });
      if (!id) return;
      const data = await attempt(window.workspace.ai.messages.list(id));
      if (data && get().activeConversationId === id) set({ messages: data });
    },
    sendMessage: async (content, attachedFiles = []) => {
      const conversationId = get().activeConversationId;
      if (!conversationId || !content.trim() || get().isStreaming) return;
      const requestId = crypto.randomUUID();
      // Mostra a pergunta imediatamente, sem esperar o round-trip do IPC.
      set({
        messages: [
          ...get().messages,
          {
            id: `pending-${requestId}`,
            conversationId,
            role: "user",
            content,
            attachedFiles,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      const unsubscribe = startStream(requestId, conversationId);
      try {
        await unwrap(window.workspace.ai.send(requestId, { conversationId, content, attachedFiles }));
      } catch (err) {
        unsubscribe();
        set({
          isStreaming: false,
          activeRequestId: null,
          error: errorMessage(err),
          messages: get().messages.filter((m) => m.id !== `pending-${requestId}`),
        });
      }
    },
    regenerate: async () => {
      const conversationId = get().activeConversationId;
      if (!conversationId || get().isStreaming) return;
      const requestId = crypto.randomUUID();
      // Remove visualmente a última resposta da IA enquanto a nova é gerada.
      const msgs = get().messages;
      const lastUser = msgs.map((m) => m.role).lastIndexOf("user");
      set({ messages: lastUser >= 0 ? msgs.slice(0, lastUser + 1) : msgs });
      const unsubscribe = startStream(requestId, conversationId);
      try {
        await unwrap(window.workspace.ai.regenerate(requestId, conversationId));
      } catch (err) {
        unsubscribe();
        set({ isStreaming: false, activeRequestId: null, error: errorMessage(err) });
      }
    },
    interrupt: async () => {
      const requestId = get().activeRequestId;
      if (requestId) await window.workspace.ai.interrupt(requestId);
    },
  };
});
