import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Code2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { AIProviderId, AIProviderStatus, AttachedFileRef } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, EmptyState, ErrorState, Field, Menu, Segmented, Spinner } from "@/components/ui/primitives";
import { MessageBubble } from "@/components/MessageBubble";
import { AttachFilesDialog } from "@/components/AttachFilesDialog";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { errorMessage, unwrap } from "@/lib/api";
import { onStreamRequest, useAIStore } from "@/stores/useAIStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { confirmAction, promptText, useUIStore } from "@/stores/useUIStore";

import { tr, trn } from "@/lib/i18n";
import { AIUsageView } from "@/components/AIUsageView";
const PROVIDER_IDS: AIProviderId[] = ["anthropic", "openai", "google"];

function ModelSelect({
  provider,
  value,
  onChange,
  className,
}: {
  provider: AIProviderStatus | undefined;
  value: string;
  onChange: (model: string) => void;
  className?: string;
}) {
  const refreshModels = useAIStore((s) => s.refreshModels);
  const [refreshing, setRefreshing] = useState(false);
  const models = provider?.models ?? [];
  const hasValue = models.some((m) => m.id === value);

  return (
    <div className={cn("flex gap-1.5", className)}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={!provider}>
        {!hasValue && value && <option value={value}>{value}</option>}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <Button
        variant="secondary"
        size="icon"
        className="h-[34px] w-[34px]"
        disabled={!provider?.connected || refreshing}
        title={tr("Atualizar lista de modelos")}
        onClick={async () => {
          if (!provider) return;
          setRefreshing(true);
          await refreshModels(provider.id);
          setRefreshing(false);
        }}
      >
        <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
      </Button>
    </div>
  );
}

// --- Nova conversa -----------------------------------------------------------------------

function NewConversationDialog({ open, initialProvider, onClose }: { open: boolean; initialProvider: AIProviderId | null; onClose: () => void }) {
  const { providers, createConversation } = useAIStore();
  const projects = useProjectsStore((s) => s.projects);
  const settings = useSettingsStore((s) => s.settings);
  const connected = providers.filter((p) => p.connected);

  const [provider, setProvider] = useState<AIProviderId | "">("");
  const [model, setModel] = useState("");
  const [projectId, setProjectId] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const preferred = [initialProvider, settings?.aiDefaultProvider].find((p) => p && connected.some((c) => c.id === p)) ?? connected[0]?.id ?? "";
    setProvider(preferred);
    const status = providers.find((p) => p.id === preferred);
    setModel(preferred && preferred === settings?.aiDefaultProvider && settings.aiDefaultModel ? settings.aiDefaultModel : status?.defaultModel ?? "");
    setProjectId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProvider]);

  const status = providers.find((p) => p.id === provider);

  async function create() {
    if (!provider || !model) return;
    setCreating(true);
    const id = await createConversation({ provider, model, projectId: projectId || undefined });
    setCreating(false);
    if (id) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tr("Nova conversa")}
      footer={
        connected.length > 0 && (
          <>
            <Button size="sm" variant="ghost" onClick={onClose}>{tr("Cancelar")}</Button>
            <Button size="sm" onClick={() => void create()} loading={creating} disabled={!provider || !model}>{tr("Começar")}</Button>
          </>
        )
      }
    >
      {connected.length === 0 ? (
        <EmptyState
          icon={Plug}
          title={tr("Nenhuma IA conectada")}
          description={tr("Conecte Claude, OpenAI ou Gemini com a sua API key em Integrações.")}
          action={
            <Button
              size="sm"
              onClick={() => {
                onClose();
                useUIStore.getState().navigate("integracoes");
              }}
            >{tr("Abrir Integrações")}</Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div>
            <span className="label">{tr("Provider")}</span>
            <Segmented
              value={provider || connected[0].id}
              onChange={(p) => {
                setProvider(p);
                setModel(providers.find((x) => x.id === p)?.defaultModel ?? "");
              }}
              options={connected.map((p) => ({ value: p.id, label: p.label }))}
            />
          </div>
          <Field label={tr("Modelo")}>
            <ModelSelect provider={status} value={model} onChange={setModel} />
          </Field>
          <Field label={tr("Projeto (opcional)")} hint={tr("Com um projeto você pode anexar arquivos dele e executar comandos sugeridos na pasta dele.")}>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{tr("Nenhum")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </Dialog>
  );
}

// --- Chat -------------------------------------------------------------------------------------

function AttachedChips({ files, onRemove }: { files: AttachedFileRef[]; onRemove: (path: string) => void }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
      <span className="text-[11px] text-text-faint">{tr("Serão enviados:")}</span>
      {files.map((f) => (
        <span key={f.path} title={f.path} className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/5 px-1.5 py-0.5 text-[11px] text-text">
          <Paperclip size={10} className="text-accent" /> {f.name}
          <button onClick={() => onRemove(f.path)} className="text-text-faint hover:text-danger" aria-label={tr("Remover {name}", { name: f.name })}>
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

function ChatView({ onNew }: { onNew: () => void }) {
  const {
    providers,
    conversations,
    activeConversationId,
    messages,
    streamingText,
    isStreaming,
    error,
    updateConversation,
    deleteConversation,
    sendMessage,
    regenerate,
    interrupt,
  } = useAIStore();
  const projects = useProjectsStore((s) => s.projects);

  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<AttachedFileRef[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find((c) => c.id === activeConversationId);
  const project = projects.find((p) => p.id === conversation?.projectId);
  const provider = providers.find((p) => p.id === conversation?.provider);

  useEffect(() => {
    // Conteúdo mandado de outra tela (ex.: "Perguntar à IA" no Notion) entra como rascunho.
    // Idempotente (o StrictMode roda efeitos duas vezes em dev): não apaga aqui.
    const pending = useAIStore.getState().pendingDraft;
    setDraft(pending && pending.conversationId === activeConversationId ? pending.text : "");
    setAttached([]);
  }, [activeConversationId]);

  // Acompanha o fim da conversa enquanto a resposta chega.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText, activeConversationId]);

  const run = useMemo(() => ({ cwd: project?.localPath ?? null, assistantLabel: provider?.label ?? tr("A IA") }), [project?.localPath, provider?.label]);

  if (!conversation) {
    return (
      <EmptyState
        className="h-full"
        icon={MessageSquare}
        title={tr("Nenhuma conversa selecionada")}
        description={tr("Escolha uma conversa ao lado ou comece uma nova.")}
        action={
          <Button size="sm" onClick={onNew}>
            <Plus size={14} />{" "}{tr("Nova conversa")}</Button>
        }
      />
    );
  }

  async function send() {
    const content = draft.trim();
    if (!content || isStreaming) return;
    const files = attached;
    setDraft("");
    setAttached([]);
    if (useAIStore.getState().pendingDraft?.conversationId === conversation?.id) useAIStore.getState().setPendingDraft(null);
    await sendMessage(content, files);
  }

  const lastIsAssistant = messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{conversation.title}</p>
          <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
            <span>{provider?.label ?? conversation.provider}</span>
            {project && (
              <>
                <span>·</span>
                <Code2 size={10} /> {project.name}
              </>
            )}
          </div>
        </div>
        <ModelSelect
          className="w-64 [&_select]:py-1 [&_select]:text-xs"
          provider={provider}
          value={conversation.model}
          onChange={(model) => void updateConversation(conversation.id, { model })}
        />
        <Menu
          trigger={<MoreHorizontal size={15} />}
          items={[
            {
              label: tr("Renomear"),
              icon: Pencil,
              onSelect: async () => {
                const title = await promptText({ title: tr("Renomear conversa"), initialValue: conversation.title, confirmLabel: tr("Salvar") });
                if (title) void updateConversation(conversation.id, { title });
              },
            },
            "separator",
            {
              label: tr("Excluir conversa"),
              icon: Trash2,
              danger: true,
              onSelect: async () => {
                if (await confirmAction({ title: tr("Excluir esta conversa?"), description: tr("Todo o histórico dela será apagado."), danger: true, confirmLabel: tr("Excluir") }))
                  void deleteConversation(conversation.id);
              },
            },
          ]}
        />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-5 py-5">
          {messages.length === 0 && !isStreaming && (
            <EmptyState icon={Bot} title={tr("Converse com {name}", { name: provider?.label ?? tr("a IA") })} description={project ? tr("Contexto: projeto {name}. Anexe arquivos para a IA ler.", { name: project.name }) : undefined} />
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              content={m.content}
              attachedFiles={m.attachedFiles}
              run={m.role === "assistant" ? run : null}
              footer={
                i === messages.length - 1 && lastIsAssistant && !isStreaming ? (
                  <Button size="xs" variant="ghost" onClick={() => void regenerate()}>
                    <RotateCcw size={11} />{" "}{tr("Regenerar resposta")}</Button>
                ) : undefined
              }
            />
          ))}
          {isStreaming && (
            <MessageBubble role="assistant" content={streamingText || "…"} footer={<Spinner className="h-3 w-3" />} />
          )}
          {error && <ErrorState message={error} onRetry={messages.some((m) => m.role === "user") ? () => void regenerate() : undefined} />}
        </div>
      </div>

      <div className="border-t border-border-subtle px-5 py-3">
        <div className="mx-auto max-w-3xl rounded-card border border-border bg-bg-elevated focus-within:border-accent/50">
          <AttachedChips files={attached} onRemove={(p) => setAttached(attached.filter((f) => f.path !== p))} />
          <textarea
            className="max-h-48 min-h-[56px] w-full resize-none bg-transparent px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none"
            placeholder={tr("Mensagem para {name}... (Enter envia, Shift+Enter quebra linha)", { name: provider?.label ?? tr("a IA") })}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAttachOpen(true)}
              disabled={!project}
              title={project ? tr("Anexar arquivos do projeto") : tr("Vincule um projeto à conversa para anexar arquivos")}
            >
              <Paperclip size={13} />{" "}{tr("Anexar")}</Button>
            <span className="ml-auto text-[11px] text-text-faint">{provider?.connected === false && tr("Provider desconectado")}</span>
            {isStreaming ? (
              <Button size="sm" variant="secondary" onClick={() => void interrupt()}>
                <Square size={12} />{" "}{tr("Interromper")}</Button>
            ) : (
              <Button size="sm" onClick={() => void send()} disabled={!draft.trim() || provider?.connected === false}>
                <Send size={13} />{" "}{tr("Enviar")}</Button>
            )}
          </div>
        </div>
      </div>

      {project && (
        <AttachFilesDialog
          open={attachOpen}
          rootPath={project.localPath}
          initiallySelected={attached}
          onClose={() => setAttachOpen(false)}
          onConfirm={(files) => {
            setAttached(files);
            setAttachOpen(false);
          }}
        />
      )}
    </div>
  );
}

// --- AI Council -------------------------------------------------------------------------------

interface CouncilAnswer {
  provider: AIProviderId;
  model: string;
  requestId: string;
  text: string;
  status: "streaming" | "done" | "error";
  error?: string;
}

function CouncilView() {
  const providers = useAIStore((s) => s.providers);
  const projects = useProjectsStore((s) => s.projects);
  const navigate = useUIStore((s) => s.navigate);
  const connected = providers.filter((p) => p.connected);

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [attached, setAttached] = useState<AttachedFileRef[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [answers, setAnswers] = useState<CouncilAnswer[]>([]);
  const [askedPrompt, setAskedPrompt] = useState("");
  const [runError, setRunError] = useState<string | null>(null);
  const [synth, setSynth] = useState<{ requestId: string; text: string; status: CouncilAnswer["status"]; error?: string } | null>(null);
  const [synthProvider, setSynthProvider] = useState<AIProviderId | "">("");
  const unsubs = useRef<(() => void)[]>([]);

  useEffect(() => {
    setEnabled((prev) => {
      const next = { ...prev };
      for (const p of connected) if (next[p.id] === undefined) next[p.id] = true;
      return next;
    });
    setModels((prev) => {
      const next = { ...prev };
      for (const p of connected) if (!next[p.id]) next[p.id] = p.defaultModel;
      return next;
    });
    if (!synthProvider && connected[0]) setSynthProvider(connected[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  useEffect(() => () => unsubs.current.forEach((u) => u()), []);

  const project = projects.find((p) => p.id === projectId);
  const targets = connected.filter((p) => enabled[p.id]).map((p) => ({ provider: p.id, model: models[p.id] || p.defaultModel }));
  const running = answers.some((a) => a.status === "streaming");
  const allDone = answers.length > 0 && !running;
  const labelOf = (id: AIProviderId) => providers.find((p) => p.id === id)?.label ?? id;

  function listen(requestId: string, onChunk: (update: (prev: CouncilAnswer) => CouncilAnswer) => void) {
    const off = onStreamRequest(requestId, (chunk) => {
      if (chunk.type === "delta") onChunk((a) => ({ ...a, text: a.text + (chunk.text ?? "") }));
      else {
        onChunk((a) => ({ ...a, status: chunk.type === "error" ? "error" : "done", error: chunk.error }));
        off();
      }
    });
    unsubs.current.push(off);
    return off;
  }

  async function run() {
    setConfirmOpen(false);
    const text = prompt.trim();
    if (!text || targets.length === 0) return;
    unsubs.current.forEach((u) => u());
    unsubs.current = [];
    setRunError(null);
    setSynth(null);
    setAskedPrompt(text);

    const withIds = targets.map((t) => ({ ...t, requestId: crypto.randomUUID() }));
    setAnswers(withIds.map((t) => ({ ...t, text: "", status: "streaming" })));
    // Os listeners precisam existir antes do disparo: o streaming começa imediatamente.
    const offs = withIds.map((t) =>
      listen(t.requestId, (update) => setAnswers((list) => list.map((a) => (a.requestId === t.requestId ? update(a) : a))))
    );
    try {
      await unwrap(
        window.workspace.ai.council.run({ prompt: text, targets: withIds, attachedFiles: attached, confirmedCount: withIds.length })
      );
    } catch (err) {
      offs.forEach((o) => o());
      setAnswers([]);
      setRunError(errorMessage(err));
    }
  }

  async function synthesize() {
    const provider = connected.find((p) => p.id === synthProvider);
    const usable = answers.filter((a) => a.status === "done" && a.text.trim());
    if (!provider || usable.length === 0) return;
    const requestId = crypto.randomUUID();
    setSynth({ requestId, text: "", status: "streaming" });
    const off = onStreamRequest(requestId, (chunk) => {
      if (chunk.type === "delta") setSynth((s) => (s && s.requestId === requestId ? { ...s, text: s.text + (chunk.text ?? "") } : s));
      else {
        setSynth((s) => (s && s.requestId === requestId ? { ...s, status: chunk.type === "error" ? "error" : "done", error: chunk.error } : s));
        off();
      }
    });
    unsubs.current.push(off);
    try {
      await unwrap(
        window.workspace.ai.council.synthesize({
          requestId,
          provider: provider.id,
          model: models[provider.id] || provider.defaultModel,
          prompt: askedPrompt,
          answers: usable.map((a) => ({ label: `${labelOf(a.provider)} (${a.model})`, content: a.text })),
        })
      );
    } catch (err) {
      off();
      setSynth({ requestId, text: "", status: "error", error: errorMessage(err) });
    }
  }

  function interruptAll() {
    for (const a of answers) if (a.status === "streaming") void window.workspace.ai.interrupt(a.requestId);
    if (synth?.status === "streaming") void window.workspace.ai.interrupt(synth.requestId);
  }

  if (connected.length === 0) {
    return (
      <EmptyState
        className="h-full"
        icon={Users}
        title={tr("O AI Council precisa de pelo menos uma IA conectada")}
        description={tr("Conecte Claude, OpenAI e/ou Gemini para comparar respostas lado a lado.")}
        action={
          <Button size="sm" onClick={() => navigate("integracoes")}>{tr("Abrir Integrações")}</Button>
        }
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-6 py-5">
        <div>
          <h2 className="text-base font-semibold text-text">{tr("AI Council")}</h2>
          <p className="text-sm text-text-muted">{tr("A mesma pergunta para vários modelos, respostas lado a lado e uma síntese final.")}</p>
        </div>

        <Card className="space-y-3 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            {PROVIDER_IDS.map((id) => {
              const p = providers.find((x) => x.id === id);
              if (!p) return null;
              return (
                <div key={id} className={cn("rounded-lg border p-2.5", p.connected && enabled[id] ? "border-accent/40 bg-accent/5" : "border-border-subtle")}>
                  <label className="mb-2 flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      disabled={!p.connected || running}
                      checked={p.connected && Boolean(enabled[id])}
                      onChange={(e) => setEnabled({ ...enabled, [id]: e.target.checked })}
                    />
                    {p.label}
                    {!p.connected && <Badge>{tr("desconectado")}</Badge>}
                  </label>
                  {p.connected && (
                    <ModelSelect
                      className="[&_select]:py-1 [&_select]:text-xs"
                      provider={p}
                      value={models[id] ?? p.defaultModel}
                      onChange={(m) => setModels({ ...models, [id]: m })}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <textarea
            className="input min-h-[90px] resize-y"
            placeholder={tr("Pergunta para o conselho...")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && prompt.trim() && targets.length > 0) setConfirmOpen(true);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-52 py-1 text-xs"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setAttached([]);
              }}
            >
              <option value="">{tr("Sem projeto (sem anexos)")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" disabled={!project} onClick={() => setAttachOpen(true)}>
              <Paperclip size={13} />{" "}{tr("Anexar")}{attached.length > 0 && ` (${attached.length})`}
            </Button>
            <div className="ml-auto flex gap-2">
              {running && (
                <Button size="sm" variant="secondary" onClick={interruptAll}>
                  <Square size={12} />{" "}{tr("Interromper")}</Button>
              )}
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!prompt.trim() || targets.length === 0 || running}>
                <Users size={13} />{" "}{tr("Perguntar ao conselho")}</Button>
            </div>
          </div>
          <AttachedChips files={attached} onRemove={(p) => setAttached(attached.filter((f) => f.path !== p))} />
        </Card>

        {runError && <ErrorState message={runError} />}

        {answers.length > 0 && (
          <div className={cn("grid gap-3", answers.length === 2 && "md:grid-cols-2", answers.length >= 3 && "lg:grid-cols-3")}>
            {answers.map((a) => (
              <Card key={a.requestId} className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
                  <Bot size={13} className="text-text-faint" />
                  <span className="text-sm font-medium text-text">{labelOf(a.provider)}</span>
                  <span className="truncate text-[11px] text-text-faint">{a.model}</span>
                  <span className="ml-auto">
                    {a.status === "streaming" ? <Spinner className="h-3 w-3" /> : a.status === "error" ? <Badge tone="danger">{tr("Erro")}</Badge> : <Badge tone="success">{tr("Pronto")}</Badge>}
                  </span>
                </div>
                <div className="min-w-0 p-3">
                  {a.status === "error" ? (
                    <ErrorState message={a.error ?? tr("Erro na IA.")} />
                  ) : (
                    <MessageBubble role="assistant" content={a.text || "…"} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {allDone && (
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles size={14} className="text-accent" />
              <span className="text-sm font-medium text-text">{tr("Síntese")}</span>
              <select className="input ml-auto w-44 py-1 text-xs" value={synthProvider} onChange={(e) => setSynthProvider(e.target.value as AIProviderId)}>
                {connected.map((p) => (
                  <option key={p.id} value={p.id}>{tr("Sintetizar com")}{" "}{p.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => void synthesize()}
                disabled={synth?.status === "streaming" || !answers.some((a) => a.status === "done" && a.text.trim())}
                loading={synth?.status === "streaming"}
              >{tr("Sintetizar respostas")}</Button>
            </div>
            {synth && (
              <div className="mt-3">
                {synth.status === "error" ? <ErrorState message={synth.error ?? tr("Erro na síntese.")} /> : <MessageBubble role="assistant" content={synth.text || "…"} />}
              </div>
            )}
          </Card>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="sm"
        title={trn(targets.length, "Enviar para {n} provider?", "Enviar para {n} providers?")}
        description={tr("Cada provider cobra pela própria resposta na sua API key.")}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(false)}>{tr("Cancelar")}</Button>
            <Button size="sm" onClick={() => void run()} data-autofocus>{tr("Enviar para")}{" "}{targets.length}
            </Button>
          </>
        }
      >
        <ul className="space-y-1 text-sm">
          {targets.map((t) => (
            <li key={t.provider} className="flex items-center gap-2">
              <Bot size={13} className="text-text-faint" />
              <span className="text-text">{labelOf(t.provider)}</span>
              <span className="text-xs text-text-faint">{t.model}</span>
            </li>
          ))}
        </ul>
        {attached.length > 0 && <p className="mt-2 text-xs text-text-muted">{trn(attached.length, "{n} arquivo anexado vai junto para todos.", "{n} arquivos anexados vão junto para todos.")}</p>}
      </Dialog>

      {project && (
        <AttachFilesDialog
          open={attachOpen}
          rootPath={project.localPath}
          initiallySelected={attached}
          onClose={() => setAttachOpen(false)}
          onConfirm={(files) => {
            setAttached(files);
            setAttachOpen(false);
          }}
        />
      )}
    </div>
  );
}

// --- Página --------------------------------------------------------------------------------------

export function AICenter() {
  const { providers, conversations, activeConversationId, loadProviders, loadConversations, selectConversation } = useAIStore();
  const { loaded: projectsLoaded, load: loadProjects } = useProjectsStore();
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);

  const [tab, setTab] = useState<"chat" | "council" | "usage">("chat");
  const [newOpen, setNewOpen] = useState(false);
  const [newProvider, setNewProvider] = useState<AIProviderId | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    void loadProviders();
    void loadConversations();
    if (!projectsLoaded) void loadProjects();
  }, [loadProviders, loadConversations, projectsLoaded, loadProjects]);

  // pageParam: "anthropic" | "openai" | "google" abre uma conversa nova com ele; "council" abre o Council.
  useEffect(() => {
    if (!pageParam) return;
    if (pageParam === "council") setTab("council");
    else if (pageParam === "usage") setTab("usage");
    else if ((PROVIDER_IDS as string[]).includes(pageParam)) {
      setTab("chat");
      setNewProvider(pageParam as AIProviderId);
      setNewOpen(true);
    }
    navigate("ia");
  }, [pageParam, navigate]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
  }, [conversations, filter]);

  const labelOf = (id: AIProviderId) => providers.find((p) => p.id === id)?.label ?? id;
  const openNew = () => {
    setNewProvider(null);
    setNewOpen(true);
  };

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border-subtle bg-bg-elevated/40">
        <div className="space-y-2 p-3">
          <Segmented
            className="flex w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:whitespace-nowrap [&>button]:px-1.5"
            value={tab}
            onChange={setTab}
            options={[
              { value: "chat", label: tr("Chat") },
              { value: "council", label: tr("AI Council") },
              { value: "usage", label: tr("Uso") },
            ]}
          />
          {tab === "chat" && (
            <>
              <Button size="sm" className="w-full" onClick={openNew}>
                <Plus size={14} />{" "}{tr("Nova conversa")}</Button>
              <input className="input py-1 text-xs" placeholder={tr("Filtrar conversas...")} value={filter} onChange={(e) => setFilter(e.target.value)} />
            </>
          )}
        </div>
        {tab === "chat" ? (
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {visible.length === 0 && <p className="px-2 py-4 text-center text-xs text-text-faint">{tr("Nenhuma conversa.")}</p>}
            {visible.map((c) => (
              <button
                key={c.id}
                onClick={() => void selectConversation(c.id)}
                className={cn(
                  "block w-full rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  c.id === activeConversationId ? "bg-bg-hover" : "hover:bg-bg-hover/60"
                )}
              >
                <p className="truncate text-[13px] text-text">{c.title}</p>
                <p className="truncate text-[11px] text-text-faint">
                  {labelOf(c.provider)} · {timeAgo(c.createdAt)}
                </p>
              </button>
            ))}
          </div>
        ) : tab === "council" ? (
          <div className="px-4 text-xs leading-relaxed text-text-muted">{tr("O Council só dispara para os providers marcados, e você confirma a quantidade antes de enviar.")}</div>
        ) : (
          <div className="px-4 text-xs leading-relaxed text-text-muted">
            {tr("Contagem de tokens informada por cada provider. O custo é uma estimativa pelos preços de tabela; a cobrança oficial está no painel de cada provider.")}
          </div>
        )}
      </aside>

      <section className="min-w-0 flex-1">
        {tab === "chat" ? <ChatView onNew={openNew} /> : tab === "council" ? <CouncilView /> : <AIUsageView />}
      </section>

      <NewConversationDialog open={newOpen} initialProvider={newProvider} onClose={() => setNewOpen(false)} />
    </div>
  );
}
