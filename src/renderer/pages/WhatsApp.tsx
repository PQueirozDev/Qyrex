import { useEffect, useMemo, useState } from "react";
import { Copy, Globe, Info, MessageCircle, Monitor, Search, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge, EmptyState, Field, LoadingRows, PageHeader } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { fuzzyFilter } from "@/lib/fuzzy";
import { useClientsStore } from "@/stores/useClientsStore";
import { toast, useUIStore } from "@/stores/useUIStore";

/**
 * WhatsApp só por caminhos oficiais: app desktop (`whatsapp://`) ou links
 * `wa.me`. Nada de bibliotecas não oficiais que automatizam o WhatsApp Web.
 */
export function WhatsApp() {
  const { clients, loaded, loading, load } = useClientsStore();
  const navigate = useUIStore((s) => s.navigate);

  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [directMessage, setDirectMessage] = useState("");

  useEffect(() => {
    if (!loaded) void load();
    void attempt(window.workspace.system.whatsappStatus()).then((s) => setDesktop(s?.desktopInstalled ?? false));
  }, [loaded, load]);

  const contacts = useMemo(() => {
    const withNumber = clients.filter((c) => c.whatsapp || c.phone);
    return fuzzyFilter(withNumber, search, (c) => `${c.name} ${c.company ?? ""} ${c.whatsapp ?? ""} ${c.phone ?? ""}`);
  }, [clients, search]);

  const openChat = (number: string, text: string) =>
    void attempt(window.workspace.system.openWhatsAppChat({ phone: number, message: text.trim() || undefined }, desktop === true));

  async function copyLink() {
    const url = await attempt(window.workspace.system.whatsappUrl({ phone, message: directMessage.trim() || undefined }));
    if (url) {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    }
  }

  const validPhone = phone.replace(/\D/g, "").length >= 8;

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        description="Conversas pelo app oficial ou pelo WhatsApp Web, com os contatos dos seus clientes."
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => void attempt(window.workspace.system.openWhatsApp("web"))}>
              <Globe size={13} /> Abrir Web
            </Button>
            <Button size="sm" onClick={() => void attempt(window.workspace.system.openWhatsApp("desktop"))} disabled={desktop === false}>
              <Monitor size={13} /> Abrir Desktop
            </Button>
          </>
        }
      />

      {desktop === false && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-muted">
          <Info size={13} className="shrink-0 text-warning" />O WhatsApp Desktop não foi encontrado. As conversas serão abertas no WhatsApp Web.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader
            title="Contatos dos clientes"
            icon={<Users size={12} />}
            action={
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-faint" />
                <input className="input w-48 py-1 pl-6 text-xs" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            }
          />
          <CardContent>
            <Field label="Mensagem inicial (opcional)" hint="Vai preenchida na conversa; você revisa e envia no WhatsApp." className="mb-3">
              <textarea className="input min-h-[56px] resize-y" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Olá! Tudo bem?" />
            </Field>
            {!loaded && loading ? (
              <LoadingRows />
            ) : contacts.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                title={search ? "Nenhum contato encontrado" : "Nenhum cliente com WhatsApp ou telefone"}
                description={search ? undefined : "Adicione o número no cadastro do cliente."}
                action={
                  !search && (
                    <Button size="sm" variant="secondary" onClick={() => navigate("clientes")}>
                      Abrir Clientes
                    </Button>
                  )
                }
              />
            ) : (
              <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {contacts.map((c) => {
                  const number = (c.whatsapp || c.phone)!;
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-xs font-semibold text-success">
                        {c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text">{c.name}</p>
                        <p className="text-[11px] text-text-faint">
                          {number}
                          {!c.whatsapp && " · telefone"}
                        </p>
                      </div>
                      {c.status !== "ativo" && <Badge>{c.status}</Badge>}
                      <Button size="xs" variant="secondary" onClick={() => openChat(number, message)}>
                        <MessageCircle size={12} className="text-success" /> Abrir conversa
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Número avulso" icon={<Send size={12} />} />
            <CardContent className="space-y-3">
              <Field label="Número com DDD" hint="Sem o +55 também funciona.">
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11 99999-0000" inputMode="tel" />
              </Field>
              <Field label="Mensagem (opcional)">
                <textarea className="input min-h-[56px] resize-y" value={directMessage} onChange={(e) => setDirectMessage(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => openChat(phone, directMessage)} disabled={!validPhone}>
                  <MessageCircle size={13} /> Abrir conversa
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void copyLink()} disabled={!validPhone} title="Copiar link wa.me">
                  <Copy size={13} />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Sobre a integração" icon={<Info size={12} />} />
            <CardContent className="space-y-2 text-xs leading-relaxed text-text-muted">
              <p>
                O Workspace abre conversas pelos links oficiais (<code className="text-text">wa.me</code> e o app desktop). Nenhuma mensagem é enviada
                sem você clicar em enviar no próprio WhatsApp.
              </p>
              <p>
                No futuro, o envio automático (lembretes de cobrança, confirmações) será feito pela <span className="text-text">WhatsApp Cloud API</span>{" "}
                oficial da Meta — nunca por bibliotecas não oficiais, que colocam o número em risco de banimento.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
