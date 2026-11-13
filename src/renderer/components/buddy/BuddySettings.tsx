import { Mascot } from "@/components/ui/Brand";
import { Segmented, Switch } from "@/components/ui/primitives";
import { tr } from "@/lib/i18n";
import { useBuddyStore } from "@/stores/useBuddyStore";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm text-text">{label}</p>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Preferências da capivara assistente (Configurações → Aparência). */
export function BuddySettings() {
  const { prefs, setPrefs, say } = useBuddyStore();
  return (
    <div className="mt-4 rounded-lg border border-border-subtle p-3">
      <div className="flex items-center gap-3 border-b border-border-subtle pb-3">
        <Mascot scale={2} bob={prefs.animations} />
        <div>
          <p className="text-sm font-medium text-text">{tr("Capivara assistente")}</p>
          <p className="text-xs text-text-muted">{tr("Fica no canto da tela, reage a tarefas, builds e foco e responde perguntas rápidas com os dados do seu PC.")}</p>
        </div>
      </div>
      <Row label={tr("Mostrar a capivara")}>
        <Switch checked={prefs.enabled} onChange={(v) => setPrefs({ enabled: v })} />
      </Row>
      {prefs.enabled && (
        <>
          <Row label={tr("Animações")} hint={tr("Desligado, ela fica parada (os ícones de humor continuam).")}>
            <Switch checked={prefs.animations} onChange={(v) => setPrefs({ animations: v })} />
          </Row>
          <Row label={tr("Reduzir movimento")}>
            <Segmented
              value={prefs.reducedMotion}
              onChange={(v) => setPrefs({ reducedMotion: v })}
              options={[
                { value: "auto", label: tr("Como o Windows") },
                { value: "on", label: tr("Sempre") },
                { value: "off", label: tr("Nunca") },
              ]}
            />
          </Row>
          <Row label={tr("Mensagens")} hint={tr("\"Poucas\" mostra só o importante, com intervalo; falhas sempre aparecem.")}>
            <Segmented
              value={prefs.frequency}
              onChange={(v) => setPrefs({ frequency: v })}
              options={[
                { value: "all", label: tr("Todas e dicas") },
                { value: "few", label: tr("Poucas") },
                { value: "silent", label: tr("Silêncio") },
              ]}
            />
          </Row>
          <Row label={tr("Posição")}>
            <Segmented
              value={prefs.position}
              onChange={(v) => setPrefs({ position: v })}
              options={[
                { value: "bottom-left", label: tr("Embaixo à esquerda") },
                { value: "bottom-right", label: tr("Embaixo à direita") },
              ]}
            />
          </Row>
          <Row label={tr("Sons")} hint={tr("Um bipe curto ao concluir e ao falhar.")}>
            <Switch checked={prefs.sounds} onChange={(v) => setPrefs({ sounds: v })} />
          </Row>
          <Row label={tr("Perguntas livres à IA")} hint={tr("Cada envio pede sua confirmação e manda só um resumo (tarefas, projetos, processos).")}>
            <Switch checked={prefs.ai} onChange={(v) => setPrefs({ ai: v })} />
          </Row>
          <button className="text-xs text-accent hover:underline" onClick={() => say(tr("Oi! Estou aqui embaixo."), { important: true, mood: "happy" })}>
            {tr("Testar")}
          </button>
        </>
      )}
    </div>
  );
}
