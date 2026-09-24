import { useEffect, useState } from "react";
import { Plus, Trash2, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useMarketingStore } from "@/stores/useMarketingStore";
import { useClientsStore } from "@/stores/useClientsStore";
import type { MarketingContent, MarketingContentType } from "@shared/types";

const STATUS_COLUMNS: { id: MarketingContent["status"]; label: string }[] = [
  { id: "ideia", label: "Ideia" },
  { id: "produzindo", label: "Produzindo" },
  { id: "pronto", label: "Pronto" },
  { id: "publicado", label: "Publicado" },
];

const TYPE_LABEL: Record<MarketingContentType, string> = {
  post: "POST",
  story: "STORY",
  reel: "REEL",
};

export function Marketing() {
  const { items, load, createItem, updateStatus, removeItem } = useMarketingStore();
  const { clients, load: loadClients } = useClientsStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MarketingContentType>("post");
  const [clientId, setClientId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  useEffect(() => {
    void load();
    void loadClients();
  }, [load, loadClients]);

  async function handleCreate() {
    const ok = await createItem({
      title,
      type,
      clientId: clientId || undefined,
      scheduledDate: scheduledDate || undefined,
    });
    if (ok) {
      setDialogOpen(false);
      setTitle("");
      setScheduledDate("");
    }
  }

  function clientName(id: string | null) {
    return clients.find((c) => c.id === id)?.name;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Marketing</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={14} /> Nova ideia / conteúdo
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_COLUMNS.map((col) => (
          <div key={col.id} className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {col.id === "ideia" && <Lightbulb size={12} />}
              {col.label}
            </h2>
            <div className="space-y-2">
              {items
                .filter((i) => i.status === col.id)
                .map((item) => (
                  <Card key={item.id}>
                    <div className="p-3">
                      <div className="flex items-start justify-between">
                        <span className="text-[10px] font-semibold text-accent">{TYPE_LABEL[item.type]}</span>
                        <button onClick={() => removeItem(item.id)} aria-label="Excluir">
                          <Trash2 size={12} className="text-text-faint hover:text-danger" />
                        </button>
                      </div>
                      <p className="mt-1 text-sm text-text">{item.title}</p>
                      {clientName(item.clientId) && (
                        <p className="mt-0.5 text-xs text-text-faint">{clientName(item.clientId)}</p>
                      )}
                      {item.scheduledDate && (
                        <p className="mt-0.5 text-xs text-text-faint">{item.scheduledDate}</p>
                      )}
                      <select
                        value={item.status}
                        onChange={(e) => updateStatus(item.id, e.target.value as MarketingContent["status"])}
                        className="mt-2 w-full rounded-md border border-border-subtle bg-bg px-1.5 py-0.5 text-xs text-text-muted"
                      >
                        {STATUS_COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Card>
                ))}
              {items.filter((i) => i.status === col.id).length === 0 && (
                <p className="text-xs text-text-faint">Nada aqui.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Novo conteúdo">
        <div className="space-y-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título / ideia"
            className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MarketingContentType)}
              className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text"
            >
              <option value="post">Post</option>
              <option value="story">Story</option>
              <option value="reel">Reel</option>
            </select>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text"
            >
              <option value="">Sem cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!title.trim()}>
              Criar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
