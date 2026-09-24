import { useEffect, useMemo, useState } from "react";
import { Plus, Send, Square, RotateCcw, Paperclip, Trash2, Bot } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MessageBubble } from "@/components/MessageBubble";
import { AttachFilesDialog } from "@/components/AttachFilesDialog";
import { cn } from "@/lib/cn";
import { useAIStore } from "@/stores/useAIStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import type { AIProviderId, AttachedFileRef } from "@shared/types";
import type { Page } from "@/App";

interface AICenterProps {
  onNavigate: (page: Page) => void;
}

export function AICenter({ onNavigate }: AICenterProps) {
  const {
    providers,
    conversations,
    activeConversationId,
    messages,
    streamingText,
    isStreaming,
    error,
    loadProviders,
    loadConversations,
    createConversation,
    deleteConversation,
    selectConversation,
    sendMessage,
    interrupt,
    regenerateLast,
  } = useAIStore();
  const { projects, load: loadProjects } = useProjectsStore();

  const [composing, setComposing] = useState(false);
  const [newProvider, setNewProvider] = useState<AIProviderId | null>(null);
  const [newModel, setNewModel] = useState("");
  const [newProjectId, setNewProjectId] = useState<string>("");

  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<AttachedFileRef[]>([]);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);

  useEffect(() => {
    void loadProviders();
    void loadConversations();
    void loadProjects();
  }, [loadProviders, loadConversations, loadProjects]);

  const connectedProviders = providers.filter((p) => p.connected);
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activeProject = projects.find((p) => p.id === activeConversation?.projectId);

  const modelsForNewProvider = useMemo(
    () => providers.find((p) => p.id === newProvider)?.models ?? [],
    [providers, newProvider]
  );

  async function handleCreateConversation() {
    if (!newProvider || !newModel) return;
    const title = `Conversa ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
    await createConversation({
      title,
      provider: newProvider,
      model: newModel,
      projectId: newProjectId || undefined,
    });
    setComposing(false);
    setNewProvider(null);
    setNewModel("");
    setNewProjectId("");
  }

  async function handleSend() {
    if (!draft.trim() || isStreaming) return;
    const content = draft;
    const files = attached;
    setDraft("");
    setAttached([]);
    await sendMessage(content, files);
  }

  if (connectedProviders.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Bot size={28} className="text-text-faint" />
        <h2 className="text-lg font-semibold text-text">Nenhum provider de IA conectado</h2>
        <p className="max-w-sm text-sm text-text-muted">
          Conecte o Claude, OpenAI ou Gemini em Integrações para começar a conversar.
        </p>
        <Button size="sm" onClick={() => onNavigate("integracoes")}>
          Ir para Integrações
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* Lista de conversas */}
      <div className="w-56 shrink-0 space-y-2 overflow-y-auto border-r border-border-subtle pr-3">
        <Button size="sm" className="w-full" onClick={() => setComposing(true)}>
          <Plus size={14} /> Nova conversa
        </Button>

        {composing && (
          <div className="space-y-1.5 rounded-lg border border-border-subtle p-2">
            <select
              value={newProvider ?? ""}
              onChange={(e) => {
                setNewProvider(e.target.value as AIProviderId);
                setNewModel("");
              }}
              className="w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-text"
            >
              <option value="">Provider...</option>
              {connectedProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {newProvider && (
              <select
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-text"
              >
                <option value="">Modelo...</option>
                {modelsForNewProvider.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            <select
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-2 py-1 text-xs text-text"
            >
              <option value="">Sem projeto vinculado</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button size="sm" className="w-full" disabled={!newProvider || !newModel} onClick={handleCreateConversation}>
              Criar
            </Button>
          </div>
        )}

        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs",
              c.id === activeConversationId ? "bg-accent-muted text-text" : "text-text-muted hover:bg-bg-elevated"
            )}
          >
            <button className="flex-1 truncate text-left" onClick={() => selectConversation(c.id)}>
              {c.title}
            </button>
            <button
              className="opacity-0 group-hover:opacity-100"
              onClick={() => deleteConversation(c.id)}
              aria-label="Excluir conversa"
            >
              <Trash2 size={12} className="text-text-faint hover:text-danger" />
            </button>
          </div>
        ))}
      </div>

      {/* Chat */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {!activeConversation ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-faint">
            Selecione ou crie uma conversa para começar.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <div className="text-xs text-text-faint">
                {providers.find((p) => p.id === activeConversation.provider)?.label} · {activeConversation.model}
                {activeProject && <> · Contexto: {activeProject.name}</>}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto py-4">
              {messages.map((m) => (
                <MessageBubble key={m.id} role={m.role} content={m.content} attachedFiles={m.attachedFiles} />
              ))}
              {isStreaming && streamingText && <MessageBubble role="assistant" content={streamingText} />}
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>

            {attached.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {attached.map((f) => (
                  <span
                    key={f.path}
                    className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent-muted px-1.5 py-0.5 text-[11px] text-text"
                  >
                    <Paperclip size={10} /> {f.name}
                    <button onClick={() => setAttached((prev) => prev.filter((x) => x.path !== f.path))}>×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 border-t border-border-subtle pt-3">
              {activeProject && (
                <Button variant="secondary" size="icon" onClick={() => setAttachDialogOpen(true)} aria-label="Anexar arquivo">
                  <Paperclip size={15} />
                </Button>
              )}
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Pergunte alguma coisa..."
                rows={2}
                className="flex-1 resize-none rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {isStreaming ? (
                <Button variant="danger" size="icon" onClick={() => void interrupt()} aria-label="Interromper">
                  <Square size={14} />
                </Button>
              ) : (
                <>
                  <Button variant="secondary" size="icon" onClick={() => void regenerateLast()} aria-label="Regenerar">
                    <RotateCcw size={14} />
                  </Button>
                  <Button size="icon" onClick={() => void handleSend()} disabled={!draft.trim()} aria-label="Enviar">
                    <Send size={14} />
                  </Button>
                </>
              )}
            </div>

            {activeProject && (
              <AttachFilesDialog
                open={attachDialogOpen}
                rootPath={activeProject.localPath}
                initiallySelected={attached}
                onClose={() => setAttachDialogOpen(false)}
                onConfirm={(files) => {
                  setAttached(files);
                  setAttachDialogOpen(false);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
