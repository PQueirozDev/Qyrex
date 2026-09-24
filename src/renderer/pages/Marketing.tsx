import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, File, Film, Image, Lightbulb, Megaphone, Plus, Smartphone, Trash2, X } from "lucide-react";
import type { MarketingContent, MarketingContentType, MarketingStatus } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, EmptyState, ErrorState, Field, LoadingRows, PageHeader, Segmented } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { addDays, basename, formatDate, parseLocalDate, todayISO, toLocalDate } from "@/lib/format";
import { useMarketingStore } from "@/stores/useMarketingStore";
import { useClientsStore } from "@/stores/useClientsStore";
import { confirmAction, toast, useUIStore } from "@/stores/useUIStore";

const STATUSES: MarketingStatus[] = ["ideia", "produzindo", "pronto", "publicado"];
const STATUS_LABEL: Record<MarketingStatus, string> = { ideia: "Ideia", produzindo: "Produzindo", pronto: "Pronto", publicado: "Publicado" };
const TYPE_LABEL: Record<MarketingContentType, string> = { post: "Post", story: "Story", reel: "Reel" };
const TYPE_ICON = { post: Image, story: Smartphone, reel: Film } as const;

function TypeBadge({ type }: { type: MarketingContentType }) {
  const Icon = TYPE_ICON[type];
  return (
    <Badge>
      <Icon size={10} /> {TYPE_LABEL[type]}
    </Badge>
  );
}

// --- Diálogo -------------------------------------------------------------------------------

function ContentDialog({ open, item, defaultDate, onClose }: { open: boolean; item: MarketingContent | null; defaultDate: string | null; onClose: () => void }) {
  const { create, update, remove } = useMarketingStore();
  const clients = useClientsStore((s) => s.clients);

  const [type, setType] = useState<MarketingContentType>("post");
  const [status, setStatus] = useState<MarketingStatus>("ideia");
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caption, setCaption] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [newFile, setNewFile] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(item?.type ?? "post");
    setStatus(item?.status ?? "ideia");
    setClientId(item?.clientId ?? "");
    setTitle(item?.title ?? "");
    setDescription(item?.description ?? "");
    setCaption(item?.caption ?? "");
    setScheduledDate(item?.scheduledDate ?? defaultDate ?? "");
    setFiles(item?.files ?? []);
    setNewFile("");
  }, [open, item, defaultDate]);

  async function addFile() {
    const p = newFile.trim().replace(/^"|"$/g, "");
    if (!p) return;
    const allowed = await attempt(window.workspace.files.isAllowed(p));
    if (!allowed) {
      toast.error("O arquivo precisa estar dentro de uma pasta autorizada.");
      return;
    }
    if (!files.includes(p)) setFiles([...files, p]);
    setNewFile("");
  }

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const ok = item
      ? await update(item.id, {
          type,
          status,
          clientId: clientId || null,
          title: title.trim(),
          description: description.trim() || null,
          caption: caption.trim() || null,
          scheduledDate: scheduledDate || null,
          files,
        })
      : await create({
          type,
          status,
          clientId: clientId || undefined,
          title: title.trim(),
          description: description.trim() || undefined,
          caption: caption.trim() || undefined,
          scheduledDate: scheduledDate || undefined,
          files,
        });
    setSaving(false);
    if (ok) onClose();
  }

  async function handleDelete() {
    if (!item) return;
    if (await confirmAction({ title: `Excluir "${item.title}"?`, description: "Essa ação não pode ser desfeita.", danger: true, confirmLabel: "Excluir" })) {
      await remove(item.id);
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissable={false}
      size="lg"
      title={item ? "Editar conteúdo" : "Novo conteúdo"}
      footer={
        <>
          {item && (
            <Button size="sm" variant="danger" className="mr-auto" onClick={() => void handleDelete()}>
              <Trash2 size={13} /> Excluir
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!title.trim()} loading={saving}>
            {item ? "Salvar" : "Criar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input className="input text-[15px] font-medium" placeholder="Título do conteúdo" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-wrap gap-3">
          <div>
            <span className="label">Tipo</span>
            <Segmented
              value={type}
              onChange={setType}
              options={(Object.keys(TYPE_LABEL) as MarketingContentType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
            />
          </div>
          <div>
            <span className="label">Status</span>
            <Segmented value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cliente">
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Conteúdo próprio</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data de publicação">
            <input type="date" className="input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Descrição / roteiro">
          <textarea className="input min-h-[70px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Legenda">
          <textarea className="input min-h-[70px] resize-y" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Texto que vai no post, com hashtags" />
        </Field>
        <div>
          <span className="label">Arquivos relacionados</span>
          {files.length > 0 && (
            <div className="mb-2 space-y-1">
              {files.map((f) => (
                <div key={f} className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg px-2 py-1 text-xs">
                  <File size={12} className="shrink-0 text-text-faint" />
                  <span className="min-w-0 flex-1 truncate text-text" title={f}>
                    {basename(f)}
                  </span>
                  <button onClick={() => void attempt(window.workspace.system.openFile(f))} className="text-text-faint hover:text-text" title="Abrir">
                    <ExternalLink size={12} />
                  </button>
                  <button onClick={() => setFiles(files.filter((x) => x !== f))} className="text-text-faint hover:text-danger" title="Remover">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className="input font-mono text-xs"
              placeholder="Cole o caminho do arquivo (pasta autorizada)"
              value={newFile}
              onChange={(e) => setNewFile(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addFile()}
            />
            <Button variant="secondary" onClick={() => void addFile()} disabled={!newFile.trim()}>
              Adicionar
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-text-faint">Dica: em Arquivos, use “Copiar caminho” no menu do arquivo.</p>
        </div>
      </div>
    </Dialog>
  );
}

// --- Visões ---------------------------------------------------------------------------------

function ContentCard({ item, onOpen, draggable, onDragStart }: { item: MarketingContent; onOpen: () => void; draggable?: boolean; onDragStart?: () => void }) {
  const client = useClientsStore((s) => s.clients.find((c) => c.id === item.clientId));
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onOpen}
      className={cn(
        "rounded-lg border border-border-subtle bg-bg-card p-2.5 shadow-card transition-colors hover:border-border",
        draggable && "cursor-grab active:cursor-grabbing"
      )}
    >
      <p className={cn("text-[13px]", item.status === "publicado" ? "text-text-muted" : "text-text")}>{item.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <TypeBadge type={item.type} />
        {client && <span className="text-[11px] text-text-faint">{client.name}</span>}
        {item.scheduledDate && (
          <span className={cn("ml-auto text-[11px]", item.status !== "publicado" && item.scheduledDate < todayISO() ? "text-danger" : "text-text-faint")}>
            {formatDate(item.scheduledDate)}
          </span>
        )}
      </div>
    </div>
  );
}

function Kanban({ items, onOpen }: { items: MarketingContent[]; onOpen: (i: MarketingContent) => void }) {
  const update = useMarketingStore((s) => s.update);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<MarketingStatus | null>(null);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {STATUSES.map((status) => {
        const column = items.filter((i) => i.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => {
              const dragged = items.find((i) => i.id === dragId);
              if (dragged && dragged.status !== status) void update(dragged.id, { status });
              setDragId(null);
              setOver(null);
            }}
            className={cn(
              "min-h-[240px] rounded-card border bg-bg-elevated/40 p-2 transition-colors",
              over === status ? "border-accent/40" : "border-border-subtle"
            )}
          >
            <div className="flex items-center justify-between px-1.5 pb-2 pt-1">
              <span className="section-title">{STATUS_LABEL[status]}</span>
              <span className="text-[11px] text-text-faint">{column.length}</span>
            </div>
            <div className="space-y-2">
              {column.map((i) => (
                <ContentCard key={i.id} item={i} onOpen={() => onOpen(i)} draggable onDragStart={() => setDragId(i.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekCalendar({ items, onOpen, onCreate }: { items: MarketingContent[]; onOpen: (i: MarketingContent) => void; onCreate: (date: string) => void }) {
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    return addDays(d, -((d.getDay() + 6) % 7)); // segunda-feira
  });
  const days = Array.from({ length: 7 }, (_, i) => toLocalDate(addDays(weekStart, i)));
  const today = todayISO();
  const unscheduled = items.filter((i) => !i.scheduledDate && i.status !== "publicado");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior">
          <ChevronLeft size={16} />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Próxima semana">
          <ChevronRight size={16} />
        </Button>
        <span className="text-sm font-semibold text-text">
          {parseLocalDate(days[0]).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} –{" "}
          {parseLocalDate(days[6]).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map((day) => {
          const date = parseLocalDate(day);
          const list = items.filter((i) => i.scheduledDate === day);
          return (
            <Card key={day} className={cn("group min-h-[200px] p-2", day === today && "border-accent/40")}>
              <div className="mb-2 flex items-center justify-between px-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-text-faint">
                  {date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                </span>
                <span className={cn("text-sm font-semibold", day === today ? "text-accent" : "text-text")}>{date.getDate()}</span>
              </div>
              <div className="space-y-1.5">
                {list.map((i) => (
                  <ContentCard key={i.id} item={i} onOpen={() => onOpen(i)} />
                ))}
                <button
                  onClick={() => onCreate(day)}
                  className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] text-text-faint opacity-0 transition-opacity hover:bg-bg-hover hover:text-text group-hover:opacity-100"
                >
                  <Plus size={11} /> Agendar
                </button>
              </div>
            </Card>
          );
        })}
      </div>
      {unscheduled.length > 0 && (
        <div>
          <p className="section-title mb-2">Sem data</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-4">
            {unscheduled.map((i) => (
              <ContentCard key={i.id} item={i} onOpen={() => onOpen(i)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Página ---------------------------------------------------------------------------------

export function Marketing() {
  const { items, loaded, loading, error, load, create } = useMarketingStore();
  const { loaded: clientsLoaded, load: loadClients, clients } = useClientsStore();
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);

  const [view, setView] = useState<"quadro" | "calendario">("quadro");
  const [clientFilter, setClientFilter] = useState("");
  const [idea, setIdea] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingContent | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);

  useEffect(() => {
    void load();
    if (!clientsLoaded) void loadClients();
  }, [load, clientsLoaded, loadClients]);

  // pageParam: "new" abre o diálogo; um id abre o conteúdo.
  useEffect(() => {
    if (!pageParam || (pageParam !== "new" && !loaded)) return;
    if (pageParam === "new") {
      setEditing(null);
      setDefaultDate(null);
      setDialogOpen(true);
    } else {
      const item = items.find((i) => i.id === pageParam);
      if (item) {
        setEditing(item);
        setDialogOpen(true);
      } else toast.error("Conteúdo não encontrado.");
    }
    navigate("marketing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageParam, loaded]);

  const filtered = useMemo(() => (clientFilter ? items.filter((i) => (clientFilter === "own" ? !i.clientId : i.clientId === clientFilter)) : items), [items, clientFilter]);

  async function addIdea() {
    const title = idea.trim();
    if (!title) return;
    const ok = await create({ title, type: "post", status: "ideia", clientId: clientFilter && clientFilter !== "own" ? clientFilter : undefined });
    if (ok) setIdea("");
  }

  const openItem = (i: MarketingContent) => {
    setEditing(i);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Marketing"
        description="Calendário de conteúdo: da ideia à publicação."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "quadro", label: "Quadro" },
                { value: "calendario", label: "Calendário" },
              ]}
            />
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDefaultDate(null);
                setDialogOpen(true);
              }}
            >
              <Plus size={14} /> Novo conteúdo
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-1.5">
          <Lightbulb size={14} className="text-warning" />
          <input
            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none"
            placeholder="Anotar uma IDEIA rápida e pressionar Enter..."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addIdea()}
          />
        </div>
        <select className="input w-48 py-1 text-xs" value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">Todos os clientes</option>
          <option value="own">Conteúdo próprio</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loaded && loading ? (
        <LoadingRows rows={4} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={Megaphone} title="Nenhum conteúdo ainda" description="Anote ideias acima e arraste pelo quadro até a publicação." />
        </Card>
      ) : view === "quadro" ? (
        <Kanban items={filtered} onOpen={openItem} />
      ) : (
        <WeekCalendar
          items={filtered}
          onOpen={openItem}
          onCreate={(date) => {
            setEditing(null);
            setDefaultDate(date);
            setDialogOpen(true);
          }}
        />
      )}

      <ContentDialog open={dialogOpen} item={editing} defaultDate={defaultDate} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
