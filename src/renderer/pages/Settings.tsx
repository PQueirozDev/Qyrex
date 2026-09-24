import { useEffect, useState, type ReactNode } from "react";
import { Code2, FileText, FolderPlus, Info, Monitor, Moon, Sun, Trash2, X } from "lucide-react";
import type { AIProviderId, NotificationPrefs } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Segmented, Spinner, Switch } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useAIStore } from "@/stores/useAIStore";
import { confirmAction } from "@/stores/useUIStore";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-text">{label}</p>
        {hint && <p className="text-[11px] text-text-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const NOTIFICATION_LABELS: Record<keyof NotificationPrefs, { label: string; hint: string }> = {
  tasks: { label: "Tarefas", hint: "Prazos de hoje e tarefas atrasadas" },
  events: { label: "Agenda", hint: "Lembrete antes dos compromissos" },
  billing: { label: "Cobranças", hint: "Clientes com cobrança próxima ou atrasada" },
  marketing: { label: "Marketing", hint: "Conteúdos agendados para hoje" },
};

export function Settings() {
  const { settings, system, update, addAllowedDir, removeAllowedDir, loadSystem } = useSettingsStore();
  const { providers, loadProviders } = useAIStore();
  const [name, setName] = useState(settings?.userName ?? "");
  const [allowedCommands, setAllowedCommands] = useState<string[] | null>(null);

  useEffect(() => {
    void loadProviders();
    void loadSystem();
    void attempt(window.workspace.commands.listAllowed()).then((list) => setAllowedCommands(list ?? []));
  }, [loadProviders, loadSystem]);

  useEffect(() => setName(settings?.userName ?? ""), [settings?.userName]);

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
      title: "Remover autorização desta pasta?",
      description: "O Workspace deixa de acessar arquivos dela. Nada é apagado do disco.",
      detail: dir,
      confirmLabel: "Remover",
    });
    if (ok) await removeAllowedDir(dir);
  }

  async function revoke(command: string) {
    await attempt(window.workspace.commands.revoke(command), "Autorização revogada");
    setAllowedCommands((list) => list?.filter((c) => c !== command) ?? null);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Configurações" />
      <div className="space-y-4">
        <Section title="Aparência">
          <Row label="Tema">
            <Segmented
              value={settings.theme}
              onChange={(theme) => void update({ theme })}
              options={[
                { value: "dark", label: <><Moon size={12} /> Escuro</> },
                { value: "light", label: <><Sun size={12} /> Claro</> },
                { value: "system", label: <><Monitor size={12} /> Sistema</> },
              ]}
            />
          </Row>
        </Section>

        <Section title="Inicialização">
          <Row label="Iniciar com o Windows" hint="Abre o Workspace ao entrar no sistema.">
            <Switch checked={settings.startWithSystem} onChange={(v) => void update({ startWithSystem: v })} />
          </Row>
          <Row label="Minimizar para a bandeja" hint="Fechar a janela mantém o app rodando na bandeja do sistema.">
            <Switch checked={settings.minimizeToTray} onChange={(v) => void update({ minimizeToTray: v })} />
          </Row>
        </Section>

        <Section title="Perfil">
          <Row label="Seu nome" hint="Usado na saudação do Início.">
            <input
              className="input w-56"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() !== settings.userName && void update({ userName: name.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </Row>
        </Section>

        <Section title="Diretórios autorizados" description="O Workspace só lê, lista ou altera arquivos dentro destas pastas. Raízes de disco, pastas do sistema e a pasta do usuário inteira não são aceitas.">
          {settings.allowedProjectDirs.length === 0 ? (
            <EmptyState className="py-4" icon={FolderPlus} title="Nenhuma pasta autorizada" />
          ) : (
            <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {settings.allowedProjectDirs.map((dir) => (
                <div key={dir} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-text">{dir}</span>
                  <Button size="icon-sm" variant="ghost" onClick={() => void removeDir(dir)} aria-label={`Remover ${dir}`}>
                    <X size={13} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={() => void addAllowedDir()}>
            <FolderPlus size={13} /> Autorizar pasta...
          </Button>
        </Section>

        <Section title="VS Code">
          <Row label="Executável" hint={system?.vscodePath ?? "Não encontrado automaticamente."}>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const picked = await attempt(window.workspace.system.pickVSCode());
                if (picked) void loadSystem();
              }}
            >
              <Code2 size={13} /> Escolher Code.exe
            </Button>
          </Row>
        </Section>

        <Section title="Terminal">
          <Row label="Shell padrão" hint="Usado no terminal integrado e ao abrir terminais externos.">
            <Segmented
              value={settings.defaultTerminal}
              onChange={(defaultTerminal) => void update({ defaultTerminal })}
              options={[
                { value: "powershell", label: "PowerShell" },
                { value: "cmd", label: "CMD" },
              ]}
            />
          </Row>
          {system && !system.terminalAvailable && (
            <p className="flex items-center gap-1.5 text-[11px] text-text-faint">
              <Info size={11} /> Terminal integrado indisponível neste sistema: os terminais abrem numa janela externa.
            </p>
          )}
        </Section>

        <Section title="IA" description="Usados ao criar uma nova conversa.">
          <Row label="Provider padrão">
            <select
              className="input w-48"
              value={settings.aiDefaultProvider ?? ""}
              onChange={(e) => {
                const id = (e.target.value || null) as AIProviderId | null;
                void update({ aiDefaultProvider: id, aiDefaultModel: providers.find((p) => p.id === id)?.defaultModel ?? null });
              }}
            >
              <option value="">Automático</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.connected}>
                  {p.label}
                  {!p.connected ? " (desconectado)" : ""}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Modelo padrão">
            <select
              className="input w-48"
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
          {connectedProviders.length === 0 && <p className="text-[11px] text-text-faint">Nenhuma IA conectada ainda — conecte em Integrações.</p>}
        </Section>

        <Section title="Notificações" description="Notificações da área de trabalho.">
          {(Object.keys(NOTIFICATION_LABELS) as (keyof NotificationPrefs)[]).map((key) => (
            <Row key={key} label={NOTIFICATION_LABELS[key].label} hint={NOTIFICATION_LABELS[key].hint}>
              <Switch
                checked={settings.notifications[key]}
                onChange={(v) => void update({ notifications: { ...settings.notifications, [key]: v } })}
              />
            </Row>
          ))}
        </Section>

        <Section title="Privacidade e segurança">
          <div>
            <p className="text-sm text-text">Comandos sempre permitidos</p>
            <p className="mb-2 text-[11px] text-text-faint">Comandos sugeridos pela IA que você marcou como “Permitir sempre”. Comandos perigosos nunca entram aqui.</p>
            {allowedCommands === null ? (
              <Spinner />
            ) : allowedCommands.length === 0 ? (
              <p className="text-xs text-text-faint">Nenhum comando pré-autorizado.</p>
            ) : (
              <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {allowedCommands.map((cmd) => (
                  <div key={cmd} className="flex items-center gap-2 px-3 py-1.5">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs text-text">{cmd}</code>
                    <Button size="xs" variant="ghost" onClick={() => void revoke(cmd)}>
                      <Trash2 size={11} /> Revogar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Row label="Logs do aplicativo" hint="Registros locais, com chaves e tokens removidos.">
            <Button size="sm" variant="secondary" onClick={() => void attempt(window.workspace.system.openLogs())}>
              <FileText size={13} /> Abrir pasta de logs
            </Button>
          </Row>
        </Section>

        <Section title="Sobre">
          <p className="text-sm text-text">QrzSpace {system ? `v${system.appVersion}` : ""}</p>
          <p className="text-xs text-text-muted">
            Central de trabalho: projetos, tarefas, arquivos, IA, clientes, marketing e integrações. Tudo local, no SQLite desta máquina.
          </p>
          {system && <p className="text-[11px] text-text-faint">Plataforma: {system.platform}</p>}
        </Section>
      </div>
    </div>
  );
}
