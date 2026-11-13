import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd, Switch } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { comboOf, defaultShortcuts, SHORTCUT_ACTIONS, type ShortcutAction } from "@/lib/shortcuts";
import { toast, useUIStore } from "@/stores/useUIStore";

/** Modo compacto e atalhos globais (Configurações → Atalhos). */
export function ShortcutsSettings() {
  const { shortcuts, setShortcuts, compact, setCompact } = useUIStore();
  const [recording, setRecording] = useState<ShortcutAction | null>(null);

  const record = (action: ShortcutAction, e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return setRecording(null);
    const combo = comboOf(e.nativeEvent);
    if (!combo) return;
    const clash = (Object.keys(shortcuts) as ShortcutAction[]).find((a) => a !== action && shortcuts[a] === combo);
    if (clash) {
      toast.error(tr("{combo} já é usado em \"{action}\".", { combo, action: tr(SHORTCUT_ACTIONS[clash].label) }));
      return;
    }
    setShortcuts({ ...shortcuts, [action]: combo });
    setRecording(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-text">{tr("Modo compacto")}</p>
          <p className="text-xs text-text-muted">{tr("Menos espaço entre os elementos, para caber mais na tela.")}</p>
        </div>
        <Switch checked={compact} onChange={setCompact} />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm text-text">{tr("Atalhos")}</p>
          <Button size="xs" variant="ghost" onClick={() => setShortcuts(defaultShortcuts())}>
            <RotateCcw size={11} /> {tr("Restaurar padrões")}
          </Button>
        </div>
        <p className="mb-2 text-xs text-text-muted">{tr("Clique num atalho e pressione a nova combinação (com Ctrl ou Alt). Esc cancela.")}</p>
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {(Object.keys(SHORTCUT_ACTIONS) as ShortcutAction[]).map((a) => (
            <li key={a} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-text">{tr(SHORTCUT_ACTIONS[a].label)}</span>
              <button
                onClick={() => setRecording(a)}
                onKeyDown={(e) => recording === a && record(a, e)}
                onBlur={() => recording === a && setRecording(null)}
                className={cn("rounded-md border px-2 py-1 text-xs transition-colors", recording === a ? "border-accent text-accent" : "border-border-subtle hover:border-border")}
                aria-label={tr("Mudar atalho de {action}", { action: tr(SHORTCUT_ACTIONS[a].label) })}
              >
                {recording === a ? tr("Pressione as teclas...") : <Kbd>{shortcuts[a].replaceAll("+", " ")}</Kbd>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
