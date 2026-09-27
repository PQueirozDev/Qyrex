import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  CheckSquare,
  Code2,
  FolderOpen,
  FolderSearch,
  Instagram,
  Mail,
  Megaphone,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { Client, ClientStatus } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Avatar, Badge, Drawer, EmptyState, ErrorState, Field, LoadingRows, PageHeader, Segmented } from "@/components/ui/primitives";
import { TaskFormDialog } from "@/components/TaskFormDialog";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate, relativeDay, todayISO } from "@/lib/format";
import { fuzzyFilter } from "@/lib/fuzzy";
import { useClientsStore } from "@/stores/useClientsStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useTasksStore } from "@/stores/useTasksStore";
import { useMarketingStore } from "@/stores/useMarketingStore";
import { confirmAction, toast, useUIStore } from "@/stores/useUIStore";

import { tr, trn } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = { ativo: tr("Ativo"), inativo: tr("Inativo"), prospecto: tr("Prospecto") };
const STATUS_TONE = { ativo: "success", inativo: "neutral", prospecto: "accent" } as const;

// --- Atalhos de contato ---------------------------------------------------------------

let whatsappDesktop: boolean | null = null;
async function preferDesktop(): Promise<boolean> {
  if (whatsappDesktop === null) {
    const status = await attempt(window.workspace.system.whatsappStatus());
    whatsappDesktop = status?.desktopInstalled ?? false;
  }
  return whatsappDesktop;
}

export async function openClientWhatsApp(phone: string, message?: string) {
  await attempt(window.workspace.system.openWhatsAppChat({ phone, message: message || undefined }, await preferDesktop()));
}

function instagramUrl(handle: string): string {
  if (/^https?:\/\//i.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

function ContactButtons({ client, size = "xs" }: { client: Client; size?: "xs" | "sm" }) {
  const open = (url: string) => void attempt(window.workspace.system.openExternalUrl(url));
  const whatsapp = client.whatsapp || client.phone;
  return (
    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
      {whatsapp && (
        <Button size={size} variant="secondary" onClick={() => void openClientWhatsApp(whatsapp)} title={tr("WhatsApp")}>
          <MessageCircle size={12} className="text-success" /> {size === "sm" && tr("WhatsApp")}
        </Button>
      )}
      {client.instagram && (
        <Button size={size} variant="secondary" onClick={() => open(instagramUrl(client.instagram!))} title={tr("Instagram")}>
          <Instagram size={12} /> {size === "sm" && tr("Instagram")}
        </Button>
      )}
      {client.email && (
        <Button size={size} variant="secondary" onClick={() => open(`mailto:${client.email}`)} title={tr("Email")}>
          <Mail size={12} /> {size === "sm" && tr("Email")}
        </Button>
      )}
      {client.phone && (
        <Button size={size} variant="secondary" onClick={() => open(`tel:${client.phone!.replace(/[^\d+]/g, "")}`)} title={tr("Ligar")}>
          <Phone size={12} /> {size === "sm" && tr("Ligar")}
        </Button>
      )}
    </div>
  );
}

// --- Formulário -------------------------------------------------------------------------

type FormState = {
  name: string;
  company: string;
  status: ClientStatus;
  phone: string;
  whatsapp: string;
  instagram: string;
  email: string;
  monthlyValue: string;
  nextBillingDate: string;
  filesPath: string;
  notes: string;
};

function toForm(c: Client | null): FormState {
  return {
    name: c?.name ?? "",
    company: c?.company ?? "",
    status: c?.status ?? "ativo",
    phone: c?.phone ?? "",
    whatsapp: c?.whatsapp ?? "",
    instagram: c?.instagram ?? "",
    email: c?.email ?? "",
    monthlyValue: c?.monthlyValue != null ? String(c.monthlyValue).replace(".", ",") : "",
    nextBillingDate: c?.nextBillingDate ?? "",
    filesPath: c?.filesPath ?? "",
    notes: c?.notes ?? "",
  };
}

function parseMoney(v: string): number | null | "invalid" {
  const clean = v.trim().replace(/[R$\s]/g, "");
  if (!clean) return null;
  // Aceita "1.500,50", "1500,50" e "1500.50".
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : "invalid";
}

function ClientDrawer({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { create, update, remove } = useClientsStore();
  const projects = useProjectsStore((s) => s.projects);
  const { tasks, toggleDone } = useTasksStore();
  const marketing = useMarketingStore((s) => s.items);
  const navigate = useUIStore((s) => s.navigate);

  const [form, setForm] = useState<FormState>(() => toForm(client));
  const [saving, setSaving] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  useEffect(() => setForm(toForm(client)), [client]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(client));
  const money = parseMoney(form.monthlyValue);

  async function save() {
    if (!form.name.trim() || money === "invalid") return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      company: form.company.trim() || null,
      status: form.status,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      instagram: form.instagram.trim() || null,
      email: form.email.trim() || null,
      monthlyValue: money,
      nextBillingDate: form.nextBillingDate || null,
      filesPath: form.filesPath || null,
      notes: form.notes.trim() || null,
    };
    if (client) {
      if (await update(client.id, payload)) toast.success(tr("Cliente salvo"));
    } else {
      const created = await create(payload);
      if (created) navigate("clientes", created.id);
    }
    setSaving(false);
  }

  async function pickFolder() {
    const dir = await attempt(window.workspace.system.pickDirectory(tr("Pasta de arquivos do cliente")));
    if (!dir) return;
    const allowed = await attempt(window.workspace.files.isAllowed(dir));
    if (!allowed) {
      toast.error(tr("Essa pasta não está dentro de um diretório autorizado (Configurações → Diretórios autorizados)."));
      return;
    }
    set("filesPath", dir);
  }

  async function handleDelete() {
    if (!client) return;
    const ok = await confirmAction({
      title: tr("Excluir o cliente \"{name}\"?", { name: client.name }),
      description: tr("Projetos, tarefas e conteúdos vinculados continuam existindo, só perdem o vínculo."),
      danger: true,
      confirmLabel: tr("Excluir"),
    });
    if (!ok) return;
    await remove(client.id);
    onClose();
  }

  const clientProjects = client ? projects.filter((p) => p.clientId === client.id) : [];
  const clientTasks = client ? tasks.filter((t) => t.clientId === client.id && t.status !== "concluido") : [];
  const clientContent = client ? marketing.filter((m) => m.clientId === client.id && m.status !== "publicado") : [];

  return (
    <Drawer
      open
      onClose={onClose}
      width={580}
      title={client ? client.name : tr("Novo cliente")}
      actions={
        client && (
          <Button size="icon-sm" variant="ghost" onClick={() => void handleDelete()} title={tr("Excluir cliente")}>
            <Trash2 size={13} className="text-danger" />
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {client && <ContactButtons client={client} size="sm" />}

        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Nome")}>
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label={tr("Empresa")}>
              <input className="input" value={form.company} onChange={(e) => set("company", e.target.value)} />
            </Field>
          </div>
          <div>
            <span className="label">{tr("Status")}</span>
            <Segmented
              value={form.status}
              onChange={(v) => set("status", v)}
              options={(Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[]).map((s) => ({ value: s, label: CLIENT_STATUS_LABEL[s] }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("WhatsApp")} hint={tr("Com DDD. Ex.: 11 99999-0000")}>
              <input className="input" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
            </Field>
            <Field label={tr("Telefone")}>
              <input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label={tr("Instagram")}>
              <input className="input" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@perfil" />
            </Field>
            <Field label={tr("Email")}>
              <input type="email" className="input" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <p className="section-title mb-2 flex items-center gap-1.5">
            <Wallet size={12} />{" "}{tr("Financeiro")}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Manutenção mensal (R$)")}>
              <input
                className={cn("input", money === "invalid" && "border-danger")}
                value={form.monthlyValue}
                onChange={(e) => set("monthlyValue", e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </Field>
            <Field
              label={tr("Próxima cobrança")}
              hint={form.nextBillingDate && form.nextBillingDate < todayISO() ? <span className="text-danger">{tr("Cobrança atrasada")}</span> : undefined}
            >
              <input type="date" className="input" value={form.nextBillingDate} onChange={(e) => set("nextBillingDate", e.target.value)} />
            </Field>
          </div>
        </section>

        <section>
          <p className="section-title mb-2">{tr("Pasta de arquivos")}</p>
          <div className="flex gap-2">
            <input className="input font-mono text-xs" value={form.filesPath} readOnly placeholder={tr("Nenhuma pasta vinculada")} />
            <Button variant="secondary" onClick={() => void pickFolder()}>
              <FolderSearch size={14} />{" "}{tr("Escolher")}</Button>
            {form.filesPath && (
              <>
                <Button variant="ghost" size="icon" onClick={() => navigate("arquivos", form.filesPath)} title={tr("Abrir em Arquivos")}>
                  <FolderOpen size={14} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => set("filesPath", "")} title={tr("Desvincular pasta")}>
                  <X size={14} />
                </Button>
              </>
            )}
          </div>
        </section>

        <Field label={tr("Observações")}>
          <textarea className="input min-h-[80px] resize-y" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2">
          {client && dirty && (
            <Button size="sm" variant="ghost" onClick={() => setForm(toForm(client))}>{tr("Descartar")}</Button>
          )}
          <Button size="sm" onClick={() => void save()} loading={saving} disabled={!form.name.trim() || money === "invalid" || (client !== null && !dirty)}>
            {client ? tr("Salvar alterações") : tr("Criar cliente")}
          </Button>
        </div>

        {client && (
          <>
            <section>
              <p className="section-title mb-2 flex items-center gap-1.5">
                <Code2 size={12} />{" "}{tr("Projetos")}</p>
              {clientProjects.length === 0 ? (
                <p className="text-xs text-text-faint">{tr("Nenhum projeto vinculado. Vincule pelo formulário do projeto.")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {clientProjects.map((p) => (
                    <Button key={p.id} size="xs" variant="secondary" onClick={() => navigate("projetos", p.id)}>
                      {p.name}
                    </Button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="section-title flex items-center gap-1.5">
                  <CheckSquare size={12} />{" "}{tr("Tarefas abertas")}</p>
                <Button size="xs" variant="ghost" onClick={() => setTaskOpen(true)}>
                  <Plus size={12} />{" "}{tr("Nova")}</Button>
              </div>
              {clientTasks.length === 0 ? (
                <p className="text-xs text-text-faint">{tr("Nenhuma tarefa aberta.")}</p>
              ) : (
                <div className="space-y-1">
                  {clientTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-accent" checked={false} onChange={() => void toggleDone(t)} aria-label={tr("Concluir")} />
                      <button className="min-w-0 flex-1 truncate text-left text-text" onClick={() => navigate("tarefas", t.id)}>
                        {t.title}
                      </button>
                      {t.dueDate && <span className="inline-block text-[11px] text-text-faint first-letter:uppercase">{relativeDay(t.dueDate)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="section-title flex items-center gap-1.5">
                  <Megaphone size={12} />{" "}{tr("Marketing em andamento")}</p>
                <Button size="xs" variant="ghost" onClick={() => navigate("marketing")}>{tr("Ver quadro")}</Button>
              </div>
              {clientContent.length === 0 ? (
                <p className="text-xs text-text-faint">{tr("Nenhum conteúdo em andamento.")}</p>
              ) : (
                <div className="space-y-1">
                  {clientContent.map((m) => (
                    <button key={m.id} onClick={() => navigate("marketing", m.id)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-bg-hover">
                      <Badge>{m.type}</Badge>
                      <span className="min-w-0 flex-1 truncate text-text">{m.title}</span>
                      {m.scheduledDate && <span className="text-[11px] text-text-faint">{formatDate(m.scheduledDate)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      {client && <TaskFormDialog open={taskOpen} onClose={() => setTaskOpen(false)} defaults={{ clientId: client.id }} />}
    </Drawer>
  );
}

// --- Página ----------------------------------------------------------------------------

export function Clients() {
  const { clients, loaded, loading, error, load } = useClientsStore();
  const { loaded: projectsLoaded, load: loadProjects } = useProjectsStore();
  const { loaded: tasksLoaded, load: loadTasks } = useTasksStore();
  const { loaded: marketingLoaded, load: loadMarketing } = useMarketingStore();
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "todos">("todos");
  const [openId, setOpenId] = useState<string | "new" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
    if (!projectsLoaded) void loadProjects();
    if (!tasksLoaded) void loadTasks();
    if (!marketingLoaded) void loadMarketing();
  }, [load, projectsLoaded, loadProjects, tasksLoaded, loadTasks, marketingLoaded, loadMarketing]);

  // pageParam: "new" abre o cadastro, "search" foca a busca, um id abre o cliente.
  useEffect(() => {
    if (!pageParam) return;
    if (pageParam === "search") setTimeout(() => searchRef.current?.focus(), 30);
    else setOpenId(pageParam);
  }, [pageParam]);

  const filtered = useMemo(() => {
    const list = statusFilter === "todos" ? clients : clients.filter((c) => c.status === statusFilter);
    return fuzzyFilter(list, search, (c) => `${c.name} ${c.company ?? ""} ${c.email ?? ""} ${c.instagram ?? ""} ${c.whatsapp ?? ""}`);
  }, [clients, search, statusFilter]);

  const counts = useMemo(
    () => ({
      ativo: clients.filter((c) => c.status === "ativo").length,
      prospecto: clients.filter((c) => c.status === "prospecto").length,
      inativo: clients.filter((c) => c.status === "inativo").length,
    }),
    [clients]
  );
  const monthly = clients.filter((c) => c.status === "ativo").reduce((sum, c) => sum + (c.monthlyValue ?? 0), 0);
  const today = todayISO();
  const current = openId && openId !== "new" ? clients.find((c) => c.id === openId) ?? null : null;

  useEffect(() => {
    if (openId && openId !== "new" && loaded && !clients.some((c) => c.id === openId)) {
      toast.error(tr("Cliente não encontrado."));
      setOpenId(null);
    }
  }, [openId, loaded, clients]);

  const close = () => {
    setOpenId(null);
    if (pageParam) navigate("clientes");
  };

  return (
    <div>
      <PageHeader
        title={tr("Clientes")}
        icon={PAGE_ICONS.clientes}
        description={trn(counts.ativo, "{n} ativo · {value}/mês em manutenção", "{n} ativos · {value}/mês em manutenção", { value: formatCurrency(monthly) })}
        actions={
          <Button size="sm" onClick={() => setOpenId("new")}>
            <Plus size={14} />{" "}{tr("Novo cliente")}</Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "todos", label: tr("Todos") },
            { value: "ativo", label: tr("Ativos"), count: counts.ativo },
            { value: "prospecto", label: tr("Prospectos"), count: counts.prospecto },
            { value: "inativo", label: tr("Inativos"), count: counts.inativo },
          ]}
        />
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
          <input ref={searchRef} className="input w-64 py-1 pl-7 text-xs" placeholder={tr("Buscar cliente...")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      <Card className="overflow-hidden">
        {!loaded && loading ? (
          <div className="p-4">
            <LoadingRows />
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={tr("Nenhum cliente ainda")}
            description={tr("Cadastre clientes para acompanhar manutenção mensal, cobranças, projetos e conteúdo.")}
            action={
              <Button size="sm" onClick={() => setOpenId("new")}>
                <Plus size={14} />{" "}{tr("Novo cliente")}</Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title={tr("Nenhum cliente encontrado")} />
        ) : (
          <div className="divide-y divide-border-subtle">
            {filtered.map((c) => (
              <div
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-hover/50"
              >
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text">{c.name}</span>
                    <Badge tone={STATUS_TONE[c.status]}>{CLIENT_STATUS_LABEL[c.status]}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-faint">
                    {c.company && <span>{c.company}</span>}
                    {c.instagram && (
                      <span className="flex items-center gap-0.5">
                        <AtSign size={10} />
                        {c.instagram.replace(/^@/, "")}
                      </span>
                    )}
                  </div>
                </div>
                {/* Colunas de largura fixa: valores e datas alinhados entre as linhas. */}
                <span className="w-32 text-right text-xs tabular-nums text-text-muted">
                  {c.monthlyValue != null && (
                    <>
                      {formatCurrency(c.monthlyValue)}
                      <span className="text-text-faint">{tr("/mês")}</span>
                    </>
                  )}
                </span>
                <span
                  className={cn("w-28 text-right text-[11px] first-letter:uppercase", c.nextBillingDate && c.nextBillingDate < today ? "text-danger" : "text-text-faint")}
                  title={c.nextBillingDate ? tr("Próxima cobrança") : undefined}
                >
                  {c.nextBillingDate && relativeDay(c.nextBillingDate)}
                </span>
                <div className="flex w-[120px] justify-end opacity-0 transition-opacity group-hover:opacity-100">
                  <ContactButtons client={c} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {(openId === "new" || current) && <ClientDrawer key={openId} client={current} onClose={close} />}
    </div>
  );
}
