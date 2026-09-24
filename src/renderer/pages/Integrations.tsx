import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bot, CalendarDays, Github, KeyRound, MessageCircle, Music, ExternalLink, ShieldCheck } from "lucide-react";
import type { IntegrationId, IntegrationStatus } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState, Field, LoadingRows, PageHeader } from "@/components/ui/primitives";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { useAIStore } from "@/stores/useAIStore";
import { confirmAction, toast, useUIStore } from "@/stores/useUIStore";

const SPOTIFY_REDIRECT = "http://127.0.0.1:43821/callback";

interface Meta {
  label: string;
  icon: typeof Bot;
  description: string;
}

const META: Record<IntegrationId, Meta> = {
  anthropic: { label: "Claude (Anthropic)", icon: Bot, description: "Chat, AI Council e comandos sugeridos." },
  openai: { label: "OpenAI", icon: Bot, description: "GPT no chat e no AI Council." },
  google: { label: "Gemini (Google)", icon: Bot, description: "Gemini no chat e no AI Council." },
  github: { label: "GitHub", icon: Github, description: "Issues, PRs e dados dos repositórios dos projetos." },
  google_calendar: { label: "Google Agenda", icon: CalendarDays, description: "Traz seus eventos para a Agenda (somente leitura)." },
  spotify: { label: "Spotify", icon: Music, description: "Mini player na barra lateral." },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, description: "Conversas pelos links oficiais (wa.me / app desktop)." },
};

const KEY_LINKS: Partial<Record<IntegrationId, string>> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/app/apikey",
  github: "https://github.com/settings/personal-access-tokens/new",
  google_calendar: "https://console.cloud.google.com/apis/credentials",
  spotify: "https://developer.spotify.com/dashboard",
};

function StatusDot({ state }: { state: IntegrationStatus["state"] }) {
  const label = state === "connected" ? "Conectado" : state === "error" ? "Erro" : "Desconectado";
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
      <span className={cn("h-2 w-2 rounded-full", state === "connected" ? "bg-success" : state === "error" ? "bg-danger" : "bg-border")} />
      {label}
    </span>
  );
}

function IntegrationCard({
  id,
  status,
  children,
  actions,
}: {
  id: IntegrationId;
  status: IntegrationStatus | undefined;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const meta = META[id];
  const Icon = meta.icon;
  const link = KEY_LINKS[id];
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-elevated">
          <Icon size={16} className="text-text-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">{meta.label}</p>
            <StatusDot state={status?.state ?? "disconnected"} />
          </div>
          <p className="text-xs text-text-muted">{meta.description}</p>
        </div>
      </div>
      {status?.state === "error" && status.detail && <p className="mt-3 rounded-md bg-danger/5 px-2 py-1 text-xs text-danger">{status.detail}</p>}
      <div className="mt-3 flex-1 space-y-2">{children}</div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border-subtle pt-3">
        {actions}
        {link && (
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => void attempt(window.workspace.system.openExternalUrl(link))}>
            <ExternalLink size={11} /> Onde conseguir
          </Button>
        )}
      </div>
    </Card>
  );
}

function SecretInput({ value, onChange, placeholder, onEnter }: { value: string; onChange: (v: string) => void; placeholder: string; onEnter?: () => void }) {
  return (
    <input
      type="password"
      autoComplete="off"
      spellCheck={false}
      className="input font-mono text-xs"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
    />
  );
}

function Masked({ value, label = "Chave" }: { value: string | undefined; label?: string }) {
  if (!value) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-text-muted">
      <KeyRound size={11} /> {label}: <span className="font-mono text-text">{value}</span>
    </p>
  );
}

// --- Cards específicos -----------------------------------------------------------------

function AIProviderCard({ id, status, reload }: { id: "anthropic" | "openai" | "google"; status: IntegrationStatus | undefined; reload: () => void }) {
  const loadProviders = useAIStore((s) => s.loadProviders);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"connect" | "test" | null>(null);
  const connected = status?.state === "connected" || status?.state === "error";

  async function connect() {
    if (!key.trim()) return;
    setBusy("connect");
    const res = await attempt(window.workspace.ai.connect(id, key.trim()));
    setBusy(null);
    if (res?.ok) {
      toast.success(`${META[id].label} conectado`);
      setKey("");
    } else if (res) toast.error(res.error ?? "Não foi possível validar a chave.");
    reload();
    void loadProviders();
  }

  async function test() {
    setBusy("test");
    const res = await attempt(window.workspace.ai.test(id));
    setBusy(null);
    if (res?.ok) toast.success("Conexão funcionando");
    else if (res) toast.error(res.error ?? "Falha no teste.");
    reload();
  }

  async function disconnect() {
    if (!(await confirmAction({ title: `Desconectar ${META[id].label}?`, description: "A chave é apagada do cofre do sistema.", confirmLabel: "Desconectar" }))) return;
    await attempt(window.workspace.ai.disconnect(id), "Desconectado");
    reload();
    void loadProviders();
  }

  return (
    <IntegrationCard
      id={id}
      status={status}
      actions={
        connected ? (
          <>
            <Button size="xs" variant="secondary" onClick={() => void test()} loading={busy === "test"}>
              Testar
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void disconnect()}>
              Desconectar
            </Button>
          </>
        ) : (
          <Button size="xs" onClick={() => void connect()} loading={busy === "connect"} disabled={!key.trim()}>
            Conectar
          </Button>
        )
      }
    >
      {connected ? (
        <Masked value={status?.info.maskedKey} label="API key" />
      ) : (
        <SecretInput value={key} onChange={setKey} placeholder="Cole a API key" onEnter={() => void connect()} />
      )}
    </IntegrationCard>
  );
}

function GitHubCard({ status, reload }: { status: IntegrationStatus | undefined; reload: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"connect" | "test" | null>(null);
  const connected = status?.state === "connected" || status?.state === "error";

  async function connect() {
    if (!token.trim()) return;
    setBusy("connect");
    const res = await attempt(window.workspace.github.connect(token.trim()));
    setBusy(null);
    if (res) {
      toast.success(`GitHub conectado como ${res.login}`);
      setToken("");
    }
    reload();
  }

  async function test() {
    setBusy("test");
    const res = await attempt(window.workspace.github.test());
    setBusy(null);
    if (res?.ok) toast.success("Conexão funcionando");
    else if (res) toast.error(res.error ?? "Falha no teste.");
    reload();
  }

  async function disconnect() {
    if (!(await confirmAction({ title: "Desconectar o GitHub?", description: "O token é apagado do cofre do sistema.", confirmLabel: "Desconectar" }))) return;
    await attempt(window.workspace.github.disconnect(), "GitHub desconectado");
    reload();
  }

  return (
    <IntegrationCard
      id="github"
      status={status}
      actions={
        connected ? (
          <>
            <Button size="xs" variant="secondary" onClick={() => void test()} loading={busy === "test"}>
              Testar
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void disconnect()}>
              Desconectar
            </Button>
          </>
        ) : (
          <Button size="xs" onClick={() => void connect()} loading={busy === "connect"} disabled={!token.trim()}>
            Conectar
          </Button>
        )
      }
    >
      {connected ? (
        <>
          {status?.info.login && <p className="text-xs text-text-muted">Conta: <span className="text-text">@{status.info.login}</span></p>}
          <Masked value={status?.info.maskedKey} label="Token" />
        </>
      ) : (
        <>
          <SecretInput value={token} onChange={setToken} placeholder="github_pat_..." onEnter={() => void connect()} />
          <p className="text-[11px] leading-relaxed text-text-faint">
            Use um <span className="text-text-muted">fine-grained personal access token</span> só com leitura de Metadata, Issues e Pull requests dos
            repositórios que quiser.
          </p>
        </>
      )}
    </IntegrationCard>
  );
}

function GoogleCalendarCard({ status, reload }: { status: IntegrationStatus | undefined; reload: () => void }) {
  const [clientId, setClientId] = useState(status?.info.clientId ?? "");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | null>(null);
  const connected = status?.state === "connected" || status?.state === "error";

  useEffect(() => {
    if (status?.info.clientId) setClientId((v) => v || status.info.clientId);
  }, [status?.info.clientId]);

  async function connect() {
    if (!clientId.trim() || !secret.trim()) return;
    setBusy("connect");
    toast.info("Autorize o acesso na janela do navegador que abriu.");
    const res = await attempt(window.workspace.googleCalendar.connect(clientId.trim(), secret.trim()), "Google Agenda conectado");
    setBusy(null);
    if (res !== undefined) setSecret("");
    reload();
  }

  async function sync() {
    setBusy("sync");
    const count = await attempt(window.workspace.googleCalendar.sync());
    setBusy(null);
    if (count !== undefined) toast.success(`${count} evento(s) sincronizado(s)`);
    reload();
  }

  async function disconnect() {
    if (!(await confirmAction({ title: "Desconectar o Google Agenda?", description: "Os tokens são apagados do cofre do sistema.", confirmLabel: "Desconectar" }))) return;
    await attempt(window.workspace.googleCalendar.disconnect(), "Google Agenda desconectado");
    reload();
  }

  return (
    <IntegrationCard
      id="google_calendar"
      status={status}
      actions={
        connected ? (
          <>
            <Button size="xs" variant="secondary" onClick={() => void sync()} loading={busy === "sync"}>
              Testar / Sincronizar
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void disconnect()}>
              Desconectar
            </Button>
          </>
        ) : (
          <Button size="xs" onClick={() => void connect()} loading={busy === "connect"} disabled={!clientId.trim() || !secret.trim()}>
            Conectar
          </Button>
        )
      }
    >
      {connected ? (
        <>
          {status?.info.clientId && <p className="truncate text-xs text-text-muted">Client ID: <span className="font-mono text-text">{status.info.clientId}</span></p>}
          {status?.info.lastSync && <p className="text-xs text-text-muted">Última sincronização: {timeAgo(status.info.lastSync)}</p>}
        </>
      ) : (
        <>
          <Field label="Client ID">
            <input className="input font-mono text-xs" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="...apps.googleusercontent.com" />
          </Field>
          <Field label="Client Secret">
            <SecretInput value={secret} onChange={setSecret} placeholder="GOCSPX-..." onEnter={() => void connect()} />
          </Field>
          <p className="text-[11px] leading-relaxed text-text-faint">
            No Google Cloud, crie um OAuth Client do tipo <span className="text-text-muted">“App para computador”</span> e ative a Google Calendar API.
          </p>
        </>
      )}
    </IntegrationCard>
  );
}

function SpotifyCard({ status, reload }: { status: IntegrationStatus | undefined; reload: () => void }) {
  const [clientId, setClientId] = useState(status?.info.clientId ?? "");
  const [busy, setBusy] = useState<"connect" | "test" | null>(null);
  const connected = status?.state === "connected" || status?.state === "error";

  useEffect(() => {
    if (status?.info.clientId) setClientId((v) => v || status.info.clientId);
  }, [status?.info.clientId]);

  async function connect() {
    if (!clientId.trim()) return;
    setBusy("connect");
    toast.info("Autorize o acesso na janela do navegador que abriu.");
    await attempt(window.workspace.spotify.connect(clientId.trim()), "Spotify conectado");
    setBusy(null);
    reload();
  }

  async function test() {
    setBusy("test");
    try {
      const playback = await unwrap(window.workspace.spotify.playback());
      toast.success(playback ? `Tocando agora: ${playback.track}` : "Conexão funcionando (nada tocando agora)");
    } catch (err) {
      toast.error(errorMessage(err));
    }
    setBusy(null);
    reload();
  }

  async function disconnect() {
    if (!(await confirmAction({ title: "Desconectar o Spotify?", description: "Os tokens são apagados do cofre do sistema.", confirmLabel: "Desconectar" }))) return;
    await attempt(window.workspace.spotify.disconnect(), "Spotify desconectado");
    reload();
  }

  return (
    <IntegrationCard
      id="spotify"
      status={status}
      actions={
        connected ? (
          <>
            <Button size="xs" variant="secondary" onClick={() => void test()} loading={busy === "test"}>
              Testar
            </Button>
            <Button size="xs" variant="ghost" onClick={() => void disconnect()}>
              Desconectar
            </Button>
          </>
        ) : (
          <Button size="xs" onClick={() => void connect()} loading={busy === "connect"} disabled={!clientId.trim()}>
            Conectar
          </Button>
        )
      }
    >
      {connected ? (
        status?.info.clientId && <p className="truncate text-xs text-text-muted">Client ID: <span className="font-mono text-text">{status.info.clientId}</span></p>
      ) : (
        <>
          <Field label="Client ID">
            <input className="input font-mono text-xs" value={clientId} onChange={(e) => setClientId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void connect()} />
          </Field>
          <p className="text-[11px] leading-relaxed text-text-faint">
            Crie um app no Spotify Developer Dashboard com o Redirect URI{" "}
            <button
              className="font-mono text-text-muted underline-offset-2 hover:underline"
              onClick={() => void navigator.clipboard.writeText(SPOTIFY_REDIRECT).then(() => toast.success("Redirect URI copiado"))}
              title="Copiar"
            >
              {SPOTIFY_REDIRECT}
            </button>
            . Só o Client ID é necessário (PKCE, sem secret).
          </p>
        </>
      )}
    </IntegrationCard>
  );
}

function WhatsAppCard({ status }: { status: IntegrationStatus | undefined }) {
  const navigate = useUIStore((s) => s.navigate);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    void attempt(window.workspace.system.whatsappStatus()).then((s) => setDesktop(s?.desktopInstalled ?? false));
  }, []);
  return (
    <IntegrationCard
      id="whatsapp"
      status={status}
      actions={
        <Button size="xs" variant="secondary" onClick={() => navigate("whatsapp")}>
          Abrir WhatsApp
        </Button>
      }
    >
      <p className="text-xs text-text-muted">
        {desktop === null ? "Verificando..." : desktop ? "WhatsApp Desktop encontrado." : "WhatsApp Desktop não encontrado — usa o WhatsApp Web."}
      </p>
      <p className="text-[11px] text-text-faint">Sem credenciais: só links oficiais. A WhatsApp Cloud API entra numa fase futura.</p>
    </IntegrationCard>
  );
}

// --- Página ----------------------------------------------------------------------------------

export function Integrations() {
  const [statuses, setStatuses] = useState<IntegrationStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    unwrap(window.workspace.integrations.list())
      .then((list) => {
        setStatuses(list);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const get = (id: IntegrationId) => statuses?.find((s) => s.id === id);

  return (
    <div>
      <PageHeader
        title="Integrações"
        description={
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-success" />
            Chaves e tokens ficam cifrados no cofre do sistema (DPAPI) e nunca aparecem por inteiro.
          </span>
        }
      />
      {error && <ErrorState message={error} onRetry={reload} />}
      {statuses === null && !error ? (
        <LoadingRows rows={4} />
      ) : (
        <div className="space-y-6">
          <section>
            <p className="section-title mb-2">Inteligência artificial</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <AIProviderCard id="anthropic" status={get("anthropic")} reload={reload} />
              <AIProviderCard id="openai" status={get("openai")} reload={reload} />
              <AIProviderCard id="google" status={get("google")} reload={reload} />
            </div>
          </section>
          <section>
            <p className="section-title mb-2">Serviços</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <GitHubCard status={get("github")} reload={reload} />
              <GoogleCalendarCard status={get("google_calendar")} reload={reload} />
              <SpotifyCard status={get("spotify")} reload={reload} />
              <WhatsAppCard status={get("whatsapp")} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
