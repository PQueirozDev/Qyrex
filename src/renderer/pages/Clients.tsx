import { useEffect, useState } from "react";
import { Plus, Search, Trash2, Phone, Instagram, Mail, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cn } from "@/lib/cn";
import { useClientsStore } from "@/stores/useClientsStore";
import type { Client } from "@shared/types";

const STATUS_LABEL: Record<Client["status"], string> = {
  ativo: "🟢 Ativo",
  inativo: "⚪ Inativo",
  prospecto: "🔵 Prospecto",
};

export function Clients() {
  const { clients, load, createClient, updateClient, removeClient, error } = useClientsStore();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Client | null>(null);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [email, setEmail] = useState("");
  const [monthlyValue, setMonthlyValue] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => void load(search || undefined), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  async function handleCreate() {
    const ok = await createClient({
      name,
      company: company || undefined,
      phone: phone || undefined,
      whatsapp: whatsapp || undefined,
      instagram: instagram || undefined,
      email: email || undefined,
      monthlyValue: monthlyValue ? Number(monthlyValue) : undefined,
    });
    if (ok) {
      setDialogOpen(false);
      setName("");
      setCompany("");
      setPhone("");
      setWhatsapp("");
      setInstagram("");
      setEmail("");
      setMonthlyValue("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Clientes</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={14} /> Novo cliente
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-1.5">
        <Search size={14} className="text-text-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <Card key={client.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-text">{client.name}</h3>
                  {client.company && <p className="text-xs text-text-faint">{client.company}</p>}
                </div>
                <button onClick={() => setToDelete(client)} aria-label="Excluir cliente">
                  <Trash2 size={14} className="text-text-faint hover:text-danger" />
                </button>
              </div>

              <select
                value={client.status}
                onChange={(e) => updateClient(client.id, { status: e.target.value as Client["status"] })}
                className={cn(
                  "mt-2 rounded-md border border-border-subtle bg-bg px-1.5 py-0.5 text-xs",
                  client.status === "ativo" && "text-success",
                  client.status === "inativo" && "text-text-faint",
                  client.status === "prospecto" && "text-accent"
                )}
              >
                {(Object.keys(STATUS_LABEL) as Client["status"][]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>

              {client.monthlyValue != null && (
                <p className="mt-2 text-xs text-text-muted">
                  Manutenção: R$ {client.monthlyValue.toFixed(2)}
                  {client.nextBillingDate && <> • Próx.: {client.nextBillingDate}</>}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {client.whatsapp && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      window.workspace.system.openExternalUrl(
                        `https://wa.me/${client.whatsapp!.replace(/\D/g, "")}`
                      )
                    }
                  >
                    <MessageCircle size={12} /> WhatsApp
                  </Button>
                )}
                {client.phone && (
                  <Button size="sm" variant="secondary" onClick={() => window.workspace.system.openExternalUrl(`tel:${client.phone}`)}>
                    <Phone size={12} />
                  </Button>
                )}
                {client.instagram && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      window.workspace.system.openExternalUrl(
                        `https://instagram.com/${client.instagram!.replace("@", "")}`
                      )
                    }
                  >
                    <Instagram size={12} />
                  </Button>
                )}
                {client.email && (
                  <Button size="sm" variant="secondary" onClick={() => window.workspace.system.openExternalUrl(`mailto:${client.email}`)}>
                    <Mail size={12} />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {clients.length === 0 && (
          <p className="text-sm text-text-faint">Nenhum cliente encontrado.</p>
        )}
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Novo cliente">
        <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome *" className="col-span-2 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent" />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Empresa" className="col-span-2 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefone" className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent" />
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="WhatsApp" className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent" />
          <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram" className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent" />
          <input value={monthlyValue} onChange={(e) => setMonthlyValue(e.target.value)} placeholder="Manutenção mensal (R$)" type="number" className="col-span-2 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim()}>
            Criar
          </Button>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title={`Excluir "${toDelete?.name}"?`}
        description="Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await removeClient(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
