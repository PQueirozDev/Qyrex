import { useEffect } from "react";
import { CheckCircle2, CloudDownload, Loader2, RefreshCw, RotateCw, TriangleAlert } from "lucide-react";
import { CHANGELOG, compareVersions } from "@shared/changelog";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader, Switch } from "@/components/ui/primitives";
import { ChangelogRelease } from "@/components/Changelog";
import { tr } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { attempt } from "@/lib/api";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUpdateStatus } from "@/components/UpdateBanner";

/** Card de status do atualizador: verificar, baixar, reiniciar. */
export function UpdateCard() {
  const status = useUpdateStatus();
  const { settings, system, update } = useSettingsStore();
  if (!settings) return null;

  const busy = status.state === "checking" || status.state === "downloading";
  let icon = <CheckCircle2 size={16} className="text-success" />;
  let text = tr("Você está na versão mais recente.");
  let action = (
    <Button size="sm" variant="secondary" loading={busy} onClick={() => void attempt(window.workspace.updates.check(true))}>
      <RefreshCw size={13} /> {tr("Verificar agora")}
    </Button>
  );

  switch (status.state) {
    case "idle":
      text = tr("Ainda não verificado nesta sessão.");
      icon = <RefreshCw size={16} className="text-text-faint" />;
      break;
    case "disabled":
      text = tr(status.reason);
      icon = <TriangleAlert size={16} className="text-text-faint" />;
      break;
    case "checking":
      text = tr("Procurando atualizações...");
      icon = <Loader2 size={16} className="animate-spin text-accent" />;
      break;
    case "available":
      text = tr("Versão {version} disponível.", { version: status.version });
      icon = <CloudDownload size={16} className="text-accent" />;
      action = (
        <Button size="sm" onClick={() => void attempt(window.workspace.updates.download())}>
          <CloudDownload size={13} /> {tr("Baixar")}
        </Button>
      );
      break;
    case "downloading":
      text = tr("Baixando a versão {version}... {percent}%", { version: status.version, percent: status.percent });
      icon = <Loader2 size={16} className="animate-spin text-accent" />;
      break;
    case "downloaded":
      text = tr("Versão {version} baixada e verificada.", { version: status.version });
      icon = <CheckCircle2 size={16} className="text-accent" />;
      action = (
        <Button size="sm" onClick={() => void attempt(window.workspace.updates.install())}>
          <RotateCw size={13} /> {tr("Reiniciar e atualizar")}
        </Button>
      );
      break;
    case "error":
      text = tr(status.message);
      icon = <TriangleAlert size={16} className="text-warning" />;
      break;
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-hover">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text">Qyrex {system ? `v${system.appVersion}` : ""}</p>
          <p className="text-xs text-text-muted">{text}</p>
          {status.state === "downloading" && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${status.percent}%` }} />
            </div>
          )}
        </div>
        {action}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
        <div>
          <p className="text-[13px] text-text">{tr("Atualizar automaticamente")}</p>
          <p className="text-[11px] text-text-faint">{tr("Ao abrir o app, baixa e instala novas versões (verificadas por SHA-512).")}</p>
        </div>
        <Switch checked={settings.autoUpdate} onChange={(v) => void update({ autoUpdate: v })} />
      </div>
    </Card>
  );
}

export function PatchNotes() {
  const { settings, system, update } = useSettingsStore();
  const latest = CHANGELOG[0]?.version;

  // Abrir a aba conta como "lido".
  useEffect(() => {
    if (settings && latest && (!settings.lastSeenVersion || compareVersions(settings.lastSeenVersion, latest) < 0)) void update({ lastSeenVersion: latest });
  }, [settings, latest, update]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={tr("Novidades")} icon={PAGE_ICONS.novidades} description={tr("O que mudou em cada versão do Qyrex.")} />
      <div className="space-y-4">
        <UpdateCard />
        <div className="relative space-y-4">
          {CHANGELOG.map((entry) => (
            <Card key={entry.version} className="p-5">
              <ChangelogRelease entry={entry} current={system?.appVersion === entry.version} />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
