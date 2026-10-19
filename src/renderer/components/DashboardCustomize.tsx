import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { DASHBOARD_WIDGETS, type DashboardPrefs, type DashboardWidgetId } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Switch } from "@/components/ui/primitives";
import { tr } from "@/lib/i18n";
import { useBusinessMode, useSettingsStore } from "@/stores/useSettingsStore";
import { tm } from "@shared/i18n";

export const WIDGET_LABEL: Record<DashboardWidgetId, string> = {
  agenda: tm("Agenda de hoje"),
  tarefas: tm("Tarefas"),
  atividade: tm("Atividade"),
  foco: tm("Foco"),
  projetos: tm("Projetos recentes"),
  cobrancas: tm("Cobranças (7 dias)"),
};

/** Ordem final: a escolhida pelo usuário + widgets novos no fim, na ordem padrão. */
export function dashboardOrder(prefs: DashboardPrefs | undefined): DashboardWidgetId[] {
  const chosen = (prefs?.order ?? []).filter((id) => (DASHBOARD_WIDGETS as readonly string[]).includes(id));
  return [...chosen, ...DASHBOARD_WIDGETS.filter((id) => !chosen.includes(id))];
}

export function DashboardCustomizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, update } = useSettingsStore();
  const businessMode = useBusinessMode();
  if (!settings) return null;
  const prefs = settings.dashboard;
  const order = dashboardOrder(prefs).filter((id) => businessMode || id !== "cobrancas");

  const save = (next: Partial<DashboardPrefs>) => void update({ dashboard: { ...prefs, order: dashboardOrder(prefs), ...next } });

  function move(id: DashboardWidgetId, delta: -1 | 1) {
    const full = dashboardOrder(prefs);
    // Move em relação ao vizinho visível nesta lista (o de cobranças pode estar escondido no modo Dev).
    const visibleIndex = order.indexOf(id);
    const neighbor = order[visibleIndex + delta];
    if (!neighbor) return;
    const a = full.indexOf(id);
    const b = full.indexOf(neighbor);
    [full[a], full[b]] = [full[b], full[a]];
    save({ order: full });
  }

  function toggle(id: DashboardWidgetId, visible: boolean) {
    save({ hidden: visible ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id] });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={tr("Personalizar o Início")}
      description={tr("Escolha quais cards aparecem e em que ordem.")}
      footer={
        <>
          <Button variant="ghost" size="sm" className="mr-auto" onClick={() => void update({ dashboard: { order: [], hidden: [] } })}>
            <RotateCcw size={13} /> {tr("Restaurar padrão")}
          </Button>
          <Button size="sm" onClick={onClose}>
            {tr("Concluir")}
          </Button>
        </>
      }
    >
      <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
        {order.map((id, i) => {
          const visible = !prefs.hidden.includes(id);
          return (
            <div key={id} className="flex items-center gap-2 px-3 py-2">
              <span className={visible ? "flex-1 text-sm text-text" : "flex-1 text-sm text-text-faint"}>{tr(WIDGET_LABEL[id])}</span>
              <Button size="icon-sm" variant="ghost" onClick={() => move(id, -1)} disabled={i === 0} title={tr("Subir")} aria-label={tr("Subir")}>
                <ArrowUp size={13} />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => move(id, 1)} disabled={i === order.length - 1} title={tr("Descer")} aria-label={tr("Descer")}>
                <ArrowDown size={13} />
              </Button>
              <Switch checked={visible} onChange={(v) => toggle(id, v)} />
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
