import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Copy, Database, ExternalLink, FileText, NotebookPen, Plug, Plus, RefreshCw, Search } from "lucide-react";
import type { IntegrationStatus, NotionItem, NotionPageContent } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, Field, LoadingRows, Segmented } from "@/components/ui/primitives";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { useAIStore } from "@/stores/useAIStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast, useUIStore } from "@/stores/useUIStore";

type Kind = "all" | "page" | "database";

function ItemIcon({ item, size = 16 }: { item: Pick<NotionItem, "icon" | "type">; size?: number }) {
  if (item.icon) return <span style={{ fontSize: size }} aria-hidden>{item.icon}</span>;
  const Icon = item.type === "database" ? Database : FileText;
  return <Icon size={size} className="text-text-faint" />;
}

/** Diálogo de nova página: título, texto (Markdown leve) e onde criar. */
function NewPageDialog({
  open,
  parents,
  initialParentId,
  onClose,
  onCreated,
}: {
  open: boolean;
  parents: NotionItem[];
  initialParentId: string | null;
  onClose: () => void;
  onCreated: (item: NotionItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setContent("");
    setParentId(initialParentId ?? parents[0]?.id ?? "");
  }, [open, initialParentId, parents]);

  const parent = parents.find((p) => p.id === parentId);

  async function create() {
    if (!parent || !title.trim()) return;
    setSaving(true);
    const item = await attempt(
      window.workspace.notion.createPage({ parentId: parent.id, parentType: parent.type, title: title.trim(), content }),
      tr("Página criada no Notion")
    );
    setSaving(false);
    if (item) onCreated(item);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={tr("Nova página no Notion")}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>{tr("Cancelar")}</Button>
          <Button size="sm" onClick={() => void create()} loading={saving} disabled={!parent || !title.trim()}>{tr("Criar página")}</Button>
        </>
      }
    >
      {parents.length === 0 ? (
        <p className="text-sm text-text-muted">{tr("Nenhuma página ou banco compartilhado com a integração ainda. No Notion, abra a página → ••• → Conexões → adicione a integração.")}</p>
      ) : (
        <div className="space-y-3">
          <Field label={tr("Onde criar")} hint={parent?.type === "database" ? tr("Vai como um novo item do banco de dados.") : tr("Vai como subpágina.")}>
            <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon ? `${p.icon} ` : ""}{p.title}{p.type === "database" ? ` · ${tr("banco")}` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tr("Título")}>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Ex.: Reunião com cliente")} autoFocus />
          </Field>
          <Field label={tr("Conteúdo")} hint={tr("Aceita # títulos, - listas e - [ ] tarefas.")}>
            <textarea className="input min-h-[140px] resize-y font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

export function Notion() {
  const navigate = useUIStore((s) => s.navigate);
  const settings = useSettingsStore((s) => s.settings);
  const { providers, loadProviders, createConversation, setPendingDraft } = useAIStore();

  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [items, setItems] = useState<NotionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NotionItem | null>(null);
  const [content, setContent] = useState<NotionPageContent | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [parents, setParents] = useState<NotionItem[]>([]);

  useEffect(() => {
    void window.workspace.integrations.list().then((r) => r.ok && setStatus(r.data.find((i) => i.id === "notion") ?? null));
  }, []);

  const connected = status?.state === "connected";

  const load = useCallback(async (q: string, k: Kind) => {
    setError(null);
    try {
      setItems(await unwrap(window.workspace.notion.search(q, k === "all" ? undefined : k)));
    } catch (err) {
      setError(errorMessage(err));
      setItems([]);
    }
  }, []);

  // Busca com pequena espera enquanto digita.
  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(() => void load(query, kind), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [connected, query, kind, load]);

  async function open(item: NotionItem) {
    setSelected(item);
    setContent(null);
    setContentError(null);
    if (item.type === "database") return;
    setLoadingPage(true);
    try {
      setContent(await unwrap(window.workspace.notion.page(item.id)));
    } catch (err) {
      setContentError(errorMessage(err));
    }
    setLoadingPage(false);
  }

  async function openNew(parentId?: string) {
    const list = await attempt(window.workspace.notion.search(""));
    if (list) setParents(list);
    setNewOpen(true);
    if (parentId) setParents((prev) => [...prev.filter((p) => p.id === parentId), ...prev.filter((p) => p.id !== parentId)]);
  }

  async function askAI() {
    if (!content) return;
    if (!providers.length) await loadProviders();
    const all = useAIStore.getState().providers.filter((p) => p.connected);
    const provider = all.find((p) => p.id === settings?.aiDefaultProvider) ?? all[0];
    if (!provider) {
      toast.error(tr("Conecte uma IA em Integrações para perguntar sobre a página."));
      return;
    }
    const body = content.markdown.length > 30_000 ? `${content.markdown.slice(0, 30_000)}\n\n…` : content.markdown;
    const id = await createConversation({ provider: provider.id, model: provider.defaultModel });
    if (!id) return;
    setPendingDraft({ conversationId: id, text: tr("Com base nesta página do Notion (\"{title}\"):\n\n{content}\n\n---\n\n", { title: content.title, content: body }) });
    navigate("ia");
  }

  const empty = useMemo(() => items !== null && items.length === 0 && !error, [items, error]);

  if (status && !connected) {
    return (
      <EmptyState
        className="mt-10"
        icon={Plug}
        title={tr("Conecte o seu Notion")}
        description={tr("Em Integrações, cole o token de uma integração interna do Notion. Depois compartilhe as páginas que o Qyrex pode ver (••• → Conexões).")}
        action={<Button size="sm" onClick={() => navigate("integracoes")}>{tr("Abrir Integrações")}</Button>}
      />
    );
  }

  return (
    <div className="flex h-full">
      {/* Lista */}
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-border-subtle bg-bg-elevated/40">
        <div className="space-y-2.5 p-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-text"><NotebookPen size={15} className="text-accent" /> {tr("Notion")}</p>
              {status?.info.workspace && <p className="truncate text-[11px] text-text-faint">{status.info.workspace}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => void load(query, kind)} title={tr("Atualizar")}><RefreshCw size={12} /></Button>
              <Button size="sm" onClick={() => void openNew()}><Plus size={13} />{" "}{tr("Nova")}</Button>
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input className="input py-1.5 pl-8 text-xs" placeholder={tr("Buscar no Notion...")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Segmented
            className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: tr("Tudo") },
              { value: "page", label: tr("Páginas") },
              { value: "database", label: tr("Bancos") },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {items === null ? (
            <LoadingRows rows={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load(query, kind)} />
          ) : empty ? (
            <p className="px-3 py-8 text-center text-xs leading-relaxed text-text-faint">
              {query ? tr("Nada encontrado.") : tr("Nenhuma página compartilhada com a integração. No Notion: ••• → Conexões → adicionar a integração.")}
            </p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.id}
                onClick={() => void open(item)}
                className={cn(
                  "press flex w-full animate-blur-in items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  selected?.id === item.id ? "bg-bg-hover" : "hover:bg-bg-hover/60"
                )}
                style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-card"><ItemIcon item={item} size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text">{item.title}</span>
                  <span className="block truncate text-[11px] text-text-faint">
                    {item.type === "database" ? tr("Banco de dados") : tr("Página")} · {timeAgo(item.lastEditedAt)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Leitor */}
      <section className="min-w-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <EmptyState className="h-full" icon={FileText} title={tr("Escolha uma página")} description={tr("O conteúdo aparece aqui, só para leitura. Dá para abrir no Notion ou mandar para a IA.")} />
            </motion.div>
          ) : (
            <motion.article
              key={selected.id}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="mx-auto max-w-3xl px-8 py-8"
            >
              <div className="mb-6 flex flex-wrap items-start gap-3">
                <span className="text-4xl leading-none"><ItemIcon item={selected} size={36} /></span>
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-text">{selected.title}</h1>
                  <p className="mt-1 text-xs text-text-faint">{tr("Editado {time}", { time: timeAgo(selected.lastEditedAt) })}</p>
                </div>
              </div>
              <div className="mb-6 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void attempt(window.workspace.system.openExternalUrl(selected.url))}>
                  <ExternalLink size={13} />{" "}{tr("Abrir no Notion")}</Button>
                {selected.type === "page" && (
                  <>
                    <Button size="sm" onClick={() => void askAI()} disabled={!content}><Bot size={13} />{" "}{tr("Perguntar à IA")}</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!content}
                      onClick={() => content && void navigator.clipboard.writeText(content.markdown).then(() => toast.success(tr("Conteúdo copiado")))}
                    >
                      <Copy size={13} />{" "}{tr("Copiar")}</Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => void openNew(selected.id)}><Plus size={13} />{" "}{selected.type === "database" ? tr("Novo item aqui") : tr("Subpágina")}</Button>
              </div>

              {selected.type === "database" ? (
                <p className="rounded-card border border-border-subtle bg-bg-card p-4 text-sm text-text-muted">
                  {tr("Bancos de dados abrem no Notion. Aqui você pode criar um novo item nele.")}
                </p>
              ) : loadingPage ? (
                <LoadingRows rows={8} />
              ) : contentError ? (
                <ErrorState message={contentError} onRetry={() => void open(selected)} />
              ) : content ? (
                <>
                  {content.markdown ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:tracking-tight prose-a:text-accent">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.markdown}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm text-text-faint">{tr("Página vazia.")}</p>
                  )}
                  {content.truncated && <p className="mt-6 text-xs text-text-faint">{tr("Página longa: mostrando só o começo. Abra no Notion para ver tudo.")}</p>}
                </>
              ) : null}
            </motion.article>
          )}
        </AnimatePresence>
      </section>

      <NewPageDialog
        open={newOpen}
        parents={parents}
        initialParentId={selected?.id ?? null}
        onClose={() => setNewOpen(false)}
        onCreated={(item) => {
          setNewOpen(false);
          void load(query, kind);
          void open(item);
        }}
      />
    </div>
  );
}
