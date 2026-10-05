import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Bell,
  Bot,
  Briefcase,
  Check,
  Code2,
  ExternalLink,
  FileText,
  FolderPlus,
  Gamepad2,
  Github,
  Globe,
  ImagePlus,
  Info,
  Languages,
  Monitor,
  Palette,
  RefreshCw,
  Shield,
  SquareTerminal,
  Trash2,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AIProviderId, AppSettings, DiscordStatus, NotificationPrefs } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, EmptyState, Spinner, Switch } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { REPO_URL, SITE_HOST, SITE_URL } from "@shared/links";
import logoUrl from "@/assets/logo.svg";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { THEMES, type ThemeDefinition } from "@/lib/themes";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useAIStore } from "@/stores/useAIStore";
import { confirmAction } from "@/stores/useUIStore";
import { UpdateCard } from "@/pages/PatchNotes";

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "aparencia", label: tr("Aparência"), icon: Palette },
  { id: "idioma", label: tr("Idioma"), icon: Languages },
  { id: "modo", label: tr("Modo de uso"), icon: Briefcase },
  { id: "geral", label: tr("Geral"), icon: User },
  { id: "pastas", label: tr("Pastas autorizadas"), icon: FolderPlus },
  { id: "ferramentas", label: tr("VS Code e terminal"), icon: SquareTerminal },
  { id: "ia", label: tr("IA"), icon: Bot },
  { id: "notificacoes", label: tr("Notificações"), icon: Bell },
  { id: "discord", label: tr("Discord"), icon: Gamepad2 },
  { id: "atualizacoes", label: tr("Atualizações"), icon: RefreshCw },
  { id: "privacidade", label: tr("Privacidade"), icon: Shield },
  { id: "sobre", label: tr("Sobre"), icon: Info },
];

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={`settings-${id}`} className="scroll-mt-4">
      <Card className="p-5">
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{description}</p>}
        </div>
        <div className="space-y-4">{children}</div>
      </Card>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-text">{label}</p>
        {hint && <div className="mt-0.5 text-[11px] leading-relaxed text-text-faint">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Miniatura do app desenhada com as cores do tema. */
function ThemePreview({ theme }: { theme: ThemeDefinition }) {
  const p = theme.preview;
  return (
    <div className="flex h-[74px] overflow-hidden rounded-md" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
      <div className="flex w-[30%] flex-col gap-1 p-1.5" style={{ background: p.sidebar, borderRight: `1px solid ${p.border}` }}>
        <div className="mb-0.5 h-2.5 w-2.5 rounded-[3px]" style={{ background: p.accent }} />
        {[0.9, 0.55, 0.7, 0.6].map((w, i) => (
          <div key={i} className="h-1 rounded-full" style={{ width: `${w * 100}%`, background: i === 0 ? p.accent : p.muted, opacity: i === 0 ? 0.9 : 0.5 }} />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <div className="h-1.5 w-1/2 rounded-full" style={{ background: p.text, opacity: 0.85 }} />
        <div className="flex flex-1 gap-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-1 rounded p-1.5" style={{ background: p.card, border: `1px solid ${p.border}` }}>
              <div className="h-1 w-2/3 rounded-full" style={{ background: p.muted, opacity: 0.6 }} />
              <div className="h-1 w-1/2 rounded-full" style={{ background: p.muted, opacity: 0.4 }} />
              <div className="mt-auto h-1.5 w-1/3 rounded-full" style={{ background: p.accent }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SystemPreview() {
  const dark = THEMES.find((t) => t.id === "dark")!;
  const light = THEMES.find((t) => t.id === "light")!;
  return (
    <div className="relative h-[74px] overflow-hidden rounded-md">
      <div className="absolute inset-0" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }}>
        <ThemePreview theme={light} />
      </div>
      <div className="absolute inset-0" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}>
        <ThemePreview theme={dark} />
      </div>
    </div>
  );
}

function ThemePicker({ value, onChange }: { value: AppSettings["theme"]; onChange: (t: AppSettings["theme"]) => void }) {
  const options: { id: AppSettings["theme"]; name: string; description: string; preview: ReactNode }[] = [
    ...THEMES.map((t) => ({ id: t.id, name: t.name, description: t.description, preview: <ThemePreview theme={t} /> })),
    { id: "system", name: tr("Sistema"), description: tr("Acompanha o modo claro/escuro do Windows."), preview: <SystemPreview /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {options.map((opt) => {
        const active = value === opt.id;
        // "Sistema" ocupa a linha inteira, em formato horizontal: os temas fecham as linhas certinho.
        const wide = opt.id === "system";
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={cn(
              "group relative rounded-lg border p-2 text-left transition-all",
              wide && "col-span-2 flex items-center gap-3 md:col-span-3",
              active ? "border-accent ring-2 ring-accent/25" : "border-border-subtle hover:border-border hover:bg-bg-hover/50"
            )}
            aria-pressed={active}
            data-theme-option={opt.id}
          >
            <div className={cn(wide && "w-40 shrink-0")}>{opt.preview}</div>
            <div className={cn(wide && "min-w-0 flex-1")}>
              <div className={cn("flex items-center justify-between gap-2 px-0.5", !wide && "mt-2")}>
                <span className="text-[13px] font-medium text-text">{opt.name}</span>
                {active && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-fg">
                    <Check size={10} strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="px-0.5 text-[11px] leading-snug text-text-faint">{opt.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const NOTIFICATION_LABELS: Record<keyof NotificationPrefs, { label: string; hint: string }> = {
  tasks: { label: tr("Tarefas"), hint: tr("Prazos de hoje e tarefas atrasadas") },
  events: { label: tr("Agenda"), hint: tr("Lembrete antes dos compromissos") },
  billing: { label: tr("Cobranças"), hint: tr("Clientes com cobrança próxima ou atrasada") },
  marketing: { label: tr("Marketing"), hint: tr("Conteúdos agendados para hoje") },
};

/** Avisos que só existem no Modo Negócio. */
const BUSINESS_NOTIFICATIONS: (keyof NotificationPrefs)[] = ["billing", "marketing"];

const DISCORD_STATUS: Record<DiscordStatus, { label: string; tone: "success" | "neutral" | "warning" | "danger" | "accent" }> = {
  disabled: { label: tr("Desligado"), tone: "neutral" },
  connecting: { label: tr("Conectando..."), tone: "accent" },
  connected: { label: tr("Aparecendo no Discord"), tone: "success" },
  "discord-not-running": { label: tr("Discord fechado — tentando a cada 30s"), tone: "warning" },
  error: { label: tr("Discord recusou o Client ID"), tone: "danger" },
};

function DiscordSection() {
  const { settings, update } = useSettingsStore();
  const [status, setStatus] = useState<DiscordStatus>("disabled");
  const [clientId, setClientId] = useState(settings?.discord.clientId ?? "");

  useEffect(() => {
    void window.workspace.discord.status().then((res) => res.ok && setStatus(res.data));
    return window.workspace.discord.onStatus(setStatus);
  }, []);
  useEffect(() => setClientId(settings?.discord.clientId ?? ""), [settings?.discord.clientId]);

  if (!settings) return null;
  const discord = settings.discord;
  const validId = /^\d{17,20}$/.test(clientId.trim());
  const st = DISCORD_STATUS[status];

  return (
    <Section
      id="discord"
      title={tr("Discord")}
      description={tr(
        "Mostra no seu perfil do Discord que você está usando o Qyrex e em qual área. Funciona pelo app do Discord instalado no PC; nada é enviado para a internet pelo Qyrex."
      )}
    >
      <Row label={tr("Mostrar atividade no Discord")} hint={<Badge tone={st.tone}>{st.label}</Badge>}>
        <Switch checked={discord.enabled} disabled={!discord.clientId} onChange={(v) => void update({ discord: { ...discord, enabled: v } })} />
      </Row>
      <div>
        <span className="label">{tr("Client ID do aplicativo no Discord")}</span>
        <div className="flex gap-2">
          <input
            className="input font-mono"
            value={clientId}
            inputMode="numeric"
            placeholder="123456789012345678"
            onChange={(e) => setClientId(e.target.value.replace(/[^\d]/g, ""))}
          />
          <Button
            variant="secondary"
            disabled={!validId || clientId.trim() === discord.clientId}
            onClick={() => void update({ discord: { ...discord, clientId: clientId.trim(), enabled: true } })}
          >
            {tr("Salvar")}
          </Button>
        </div>
        <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-text-faint">
          <li>
            {tr("Crie um aplicativo chamado Qyrex em")}{" "}
            <button
              className="inline-flex items-center gap-0.5 text-accent hover:underline"
              onClick={() => void window.workspace.system.openExternalUrl("https://discord.com/developers/applications")}
            >
              discord.com/developers <ExternalLink size={10} />
            </button>
          </li>
          <li>{tr("Em Rich Presence → Art Assets, envie o ícone do app com o nome qyrex.")}</li>
          <li>{tr("Copie o Application ID e cole aqui.")}</li>
        </ol>
      </div>
      <Row label={tr("Mostrar nome do projeto")} hint={tr("Desligado por padrão: nomes de projetos podem ser de clientes.")}>
        <Switch checked={discord.showProject} disabled={!discord.enabled} onChange={(v) => void update({ discord: { ...discord, showProject: v } })} />
      </Row>
    </Section>
  );
}

export function Settings() {
  const { settings, system, update, addAllowedDir, removeAllowedDir, setAllowAllDirs, loadSystem, avatar, pickAvatar, removeAvatar } = useSettingsStore();
  const { providers, loadProviders } = useAIStore();
  const [name, setName] = useState(settings?.userName ?? "");
  const [allowedCommands, setAllowedCommands] = useState<string[] | null>(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const loaded = settings !== null;

  useEffect(() => {
    void loadProviders();
    void loadSystem();
    void attempt(window.workspace.commands.listAllowed()).then((list) => setAllowedCommands(list ?? []));
  }, [loadProviders, loadSystem]);

  useEffect(() => setName(settings?.userName ?? ""), [settings?.userName]);

  // Destaca na navegação lateral a seção visível.
  useEffect(() => {
    if (!loaded) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id.replace("settings-", ""));
      },
      { rootMargin: "-10% 0px -70% 0px" }
    );
    document.querySelectorAll("[id^=settings-]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loaded]);

  if (!settings) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const connectedProviders = providers.filter((p) => p.connected);
  const defaultProvider = providers.find((p) => p.id === settings.aiDefaultProvider);

  async function removeDir(dir: string) {
    const ok = await confirmAction({
      title: tr("Remover autorização desta pasta?"),
      description: tr("O Qyrex deixa de acessar arquivos dela. Nada é apagado do disco."),
      detail: dir,
      confirmLabel: tr("Remover"),
    });
    if (ok) await removeAllowedDir(dir);
  }

  async function revoke(command: string) {
    await attempt(window.workspace.commands.revoke(command), tr("Autorização revogada"));
    setAllowedCommands((list) => list?.filter((c) => c !== command) ?? null);
  }

  return (
    <div className="mx-auto flex max-w-5xl gap-8">
      <nav className="sticky top-0 hidden h-fit w-48 shrink-0 space-y-0.5 pt-1 lg:block">
        <h1 className="mb-3 px-2.5 text-xl font-semibold tracking-tight text-text">{tr("Configurações")}</h1>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => document.getElementById(`settings-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className={cn(
              "relative flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
              activeSection === s.id ? "font-medium text-text" : "text-text-muted hover:bg-bg-hover/60 hover:text-text"
            )}
          >
            {/* Acompanha a seção visível com a mesma pílula em mola da barra lateral. */}
            {activeSection === s.id && (
              <motion.span
                layoutId="settings-active"
                transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.7 }}
                className="absolute inset-0 rounded-lg bg-bg-hover"
              />
            )}
            <s.icon size={14} className={cn("relative", activeSection === s.id ? "text-accent" : "text-text-faint")} />
            <span className="relative">{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-4 pb-10">
        <h1 className="text-xl font-semibold tracking-tight text-text lg:hidden">{tr("Configurações")}</h1>

        <Section id="aparencia" title={tr("Aparência")} description={tr("Escolha o tema do Qyrex. A mudança é aplicada na hora.")}>
          <ThemePicker value={settings.theme} onChange={(theme) => void update({ theme })} />
          <Row label={tr("Animação de abertura")} hint={tr("Mostra a capivara e o nome do Qyrex ao abrir o app.")}>
            <Switch checked={settings.splashAnimation} onChange={(v) => void update({ splashAnimation: v })} />
          </Row>
        </Section>

        <Section id="idioma" title={tr("Idioma")} description={tr("Idioma da interface, das notificações e das respostas da IA. O app recarrega ao trocar.")}>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { id: "pt", label: "Português (Brasil)", sample: "Bom dia! 3 tarefas para hoje." },
                { id: "en", label: "English", sample: "Good morning! 3 tasks for today." },
              ] as const
            ).map((lang) => (
              <button
                key={lang.id}
                onClick={() => lang.id !== settings.language && void update({ language: lang.id })}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                  settings.language === lang.id ? "border-accent ring-2 ring-accent/25" : "border-border-subtle hover:border-border hover:bg-bg-hover/50"
                )}
                aria-pressed={settings.language === lang.id}
                data-language-option={lang.id}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-hover font-mono text-xs font-semibold uppercase text-text-muted">
                  {lang.id}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-text">{lang.label}</span>
                  <span className="block truncate text-[11px] text-text-faint">{lang.sample}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          id="modo"
          title={tr("Modo de uso")}
          description={tr("O modo Dev mostra só o que é de desenvolvimento. O modo Negócio adiciona clientes, cobranças, marketing e WhatsApp.")}
        >
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { business: false, icon: Code2, label: tr("Dev"), sample: tr("Projetos, tarefas, terminal, arquivos e IA") },
                { business: true, icon: Briefcase, label: tr("Dev + Negócio"), sample: tr("Tudo do Dev, mais clientes, marketing e WhatsApp") },
              ] as const
            ).map((mode) => (
              <button
                key={String(mode.business)}
                onClick={() => mode.business !== settings.businessMode && void update({ businessMode: mode.business })}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                  settings.businessMode === mode.business ? "border-accent ring-2 ring-accent/25" : "border-border-subtle hover:border-border hover:bg-bg-hover/50"
                )}
                aria-pressed={settings.businessMode === mode.business}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg-hover text-text-muted">
                  <mode.icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-text">{mode.label}</span>
                  <span className="block truncate text-[11px] text-text-faint">{mode.sample}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section id="geral" title={tr("Geral")}>
          <Row label={tr("Foto de perfil")} hint={tr("Por padrão é o ícone do Qyrex. A imagem escolhida é recortada em quadrado e fica só neste PC.")}>
            <div className="flex items-center gap-3">
              <ProfileAvatar size={44} />
              <Button size="sm" variant="secondary" onClick={() => void pickAvatar()}>
                <ImagePlus size={13} /> {avatar ? tr("Trocar foto") : tr("Escolher foto")}
              </Button>
              {avatar && (
                <Button size="sm" variant="ghost" onClick={() => void removeAvatar()}>
                  <Trash2 size={13} /> {tr("Usar ícone padrão")}
                </Button>
              )}
            </div>
          </Row>
          <Row label={tr("Seu nome")} hint={tr("Usado na saudação do Início.")}>
            <input
              className="input w-56"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() !== settings.userName && void update({ userName: name.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </Row>
          <Row label={tr("Iniciar com o Windows")} hint={tr("Abre o Qyrex ao entrar no sistema.")}>
            <Switch checked={settings.startWithSystem} onChange={(v) => void update({ startWithSystem: v })} />
          </Row>
          <Row label={tr("Minimizar para a bandeja")} hint={tr("Fechar a janela mantém o app rodando na bandeja do sistema.")}>
            <Switch checked={settings.minimizeToTray} onChange={(v) => void update({ minimizeToTray: v })} />
          </Row>
        </Section>

        <Section
          id="pastas"
          title={tr("Pastas autorizadas")}
          description={tr("Escolha se o Qyrex pode acessar o PC inteiro ou só as pastas que você autorizar.")}
        >
          <Row
            label={tr("Permitir todas as pastas do PC")}
            hint={tr("O Qyrex lê, lista e altera arquivos em qualquer pasta, sem precisar autorizar uma por uma.")}
          >
            <Switch checked={settings.allowAllDirs} onChange={(v) => void setAllowAllDirs(v)} />
          </Row>
          {!settings.allowAllDirs && (settings.allowedProjectDirs.length === 0 ? (
            <EmptyState className="py-4" icon={FolderPlus} title={tr("Nenhuma pasta autorizada")} />
          ) : (
            <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {settings.allowedProjectDirs.map((dir) => (
                <div key={dir} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">{dir}</span>
                  <Button size="icon-sm" variant="ghost" onClick={() => void removeDir(dir)} aria-label={tr("Remover {name}", { name: dir })}>
                    <X size={13} />
                  </Button>
                </div>
              ))}
            </div>
          ))}
          {!settings.allowAllDirs && (
            <Button size="sm" variant="secondary" onClick={() => void addAllowedDir()}>
              <FolderPlus size={13} /> {tr("Autorizar pasta...")}
            </Button>
          )}
        </Section>

        <Section id="ferramentas" title={tr("VS Code e terminal")}>
          <Row label={tr("VS Code")} hint={system?.vscodePath ?? tr("Não encontrado automaticamente.")}>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const picked = await attempt(window.workspace.system.pickVSCode());
                if (picked) void loadSystem();
              }}
            >
              <Code2 size={13} /> {tr("Escolher Code.exe")}
            </Button>
          </Row>
          <Row label={tr("Shell padrão")} hint={tr("Usado no terminal integrado e ao abrir terminais externos.")}>
            <div className="inline-flex rounded-lg border border-border-subtle bg-bg-elevated p-0.5">
              {(["powershell", "cmd"] as const).map((sh) => (
                <button
                  key={sh}
                  onClick={() => void update({ defaultTerminal: sh })}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    settings.defaultTerminal === sh ? "bg-bg-card text-text shadow-sm ring-1 ring-border-subtle" : "text-text-muted hover:text-text"
                  )}
                >
                  {sh === "powershell" ? "PowerShell" : "CMD"}
                </button>
              ))}
            </div>
          </Row>
          {system && !system.terminalAvailable && (
            <p className="flex items-center gap-1.5 text-[11px] text-text-faint">
              <Info size={11} /> {tr("Terminal integrado indisponível neste sistema: os terminais abrem numa janela externa.")}
            </p>
          )}
        </Section>

        <Section id="ia" title={tr("IA")} description={tr("Usados ao criar uma nova conversa.")}>
          <Row label={tr("Provider padrão")}>
            <select
              className="input w-52"
              value={settings.aiDefaultProvider ?? ""}
              onChange={(e) => {
                const id = (e.target.value || null) as AIProviderId | null;
                void update({ aiDefaultProvider: id, aiDefaultModel: providers.find((p) => p.id === id)?.defaultModel ?? null });
              }}
            >
              <option value="">{tr("Automático")}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.connected}>
                  {p.label}
                  {!p.connected ? ` (${tr("desconectado")})` : ""}
                </option>
              ))}
            </select>
          </Row>
          <Row label={tr("Modelo padrão")}>
            <select
              className="input w-52"
              value={settings.aiDefaultModel ?? ""}
              disabled={!defaultProvider}
              onChange={(e) => void update({ aiDefaultModel: e.target.value || null })}
            >
              {settings.aiDefaultModel && !defaultProvider?.models.some((m) => m.id === settings.aiDefaultModel) && (
                <option value={settings.aiDefaultModel}>{settings.aiDefaultModel}</option>
              )}
              {defaultProvider?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Row>
          {connectedProviders.length === 0 && <p className="text-[11px] text-text-faint">{tr("Nenhuma IA conectada ainda — conecte em Integrações.")}</p>}
        </Section>

        <Section id="notificacoes" title={tr("Notificações")} description={tr("Notificações da área de trabalho.")}>
          {(Object.keys(NOTIFICATION_LABELS) as (keyof NotificationPrefs)[])
            .filter((key) => settings.businessMode || !BUSINESS_NOTIFICATIONS.includes(key))
            .map((key) => (
              <Row key={key} label={NOTIFICATION_LABELS[key].label} hint={NOTIFICATION_LABELS[key].hint}>
                <Switch checked={settings.notifications[key]} onChange={(v) => void update({ notifications: { ...settings.notifications, [key]: v } })} />
              </Row>
            ))}
        </Section>

        <DiscordSection />

        <section id="settings-atualizacoes" className="scroll-mt-4">
          <h2 className="mb-2 px-1 text-[15px] font-semibold tracking-tight text-text">{tr("Atualizações")}</h2>
          <UpdateCard />
        </section>

        <Section id="privacidade" title={tr("Privacidade e segurança")}>
          <div>
            <p className="text-sm text-text">{tr("Comandos sempre permitidos")}</p>
            <p className="mb-2 text-[11px] text-text-faint">
              {tr("Comandos sugeridos pela IA que você marcou como “Permitir sempre”. Comandos perigosos nunca entram aqui.")}
            </p>
            {allowedCommands === null ? (
              <Spinner />
            ) : allowedCommands.length === 0 ? (
              <p className="text-xs text-text-faint">{tr("Nenhum comando pré-autorizado.")}</p>
            ) : (
              <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {allowedCommands.map((cmd) => (
                  <div key={cmd} className="flex items-center gap-2 px-3 py-1.5">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-text">{cmd}</code>
                    <Button size="xs" variant="ghost" onClick={() => void revoke(cmd)}>
                      <Trash2 size={11} /> {tr("Revogar")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Row label={tr("Logs do aplicativo")} hint={tr("Registros locais, com chaves e tokens removidos.")}>
            <Button size="sm" variant="secondary" onClick={() => void attempt(window.workspace.system.openLogs())}>
              <FileText size={13} /> {tr("Abrir pasta de logs")}
            </Button>
          </Row>
        </Section>

        <Section id="sobre" title={tr("Sobre")}>
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 [image-rendering:pixelated]" draggable={false} />
            <div>
              <p className="text-sm font-medium text-text">Qyrex {system ? `v${system.appVersion}` : ""}</p>
              <p className="text-xs text-text-muted">{tr("Central de trabalho: projetos, tarefas, arquivos, IA, clientes, marketing e integrações.")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void attempt(window.workspace.system.openExternalUrl(SITE_URL))}>
              <Globe size={13} /> {SITE_HOST}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void attempt(window.workspace.system.openExternalUrl(REPO_URL))}>
              <Github size={13} /> {tr("Código no GitHub")}
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-text-faint">
            <Monitor size={11} /> {system?.platform} · {tr("Tudo local, no SQLite desta máquina.")}
          </p>
        </Section>
      </div>
    </div>
  );
}
