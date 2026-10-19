import { useEffect, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, ChevronRight, Circle, Code2, FolderOpen, Loader2, MinusCircle, Play, SquareTerminal, XCircle } from "lucide-react";
import type { Automation, AutomationRun, AutomationStep, AutomationStepStatus, CommandRisk } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { tr, trn } from "@/lib/i18n";
import { tm } from "@shared/i18n";

export const RISK_LABEL: Record<CommandRisk, string> = { safe: tm("Seguro"), normal: tm("Normal"), dangerous: tm("Perigoso") };
export const RISK_TONE: Record<CommandRisk, "success" | "neutral" | "danger"> = { safe: "success", normal: "neutral", dangerous: "danger" };
const OPEN_LABEL = { vscode: tm("Abrir no VS Code"), explorer: tm("Abrir no Explorer"), terminal: tm("Abrir terminal na pasta") } as const;
const OPEN_ICON = { vscode: Code2, explorer: FolderOpen, terminal: SquareTerminal } as const;

export function stepText(step: AutomationStep): string {
  return step.kind === "command" ? step.command : tr(OPEN_LABEL[step.target]);
}

export function StepIcon({ step }: { step: AutomationStep }) {
  const Icon = step.kind === "command" ? ChevronRight : OPEN_ICON[step.target];
  return <Icon size={13} className="shrink-0 text-text-faint" />;
}

const STATUS_ICON: Record<AutomationStepStatus, { icon: typeof Circle; className: string }> = {
  pending: { icon: Circle, className: "text-text-faint" },
  running: { icon: Loader2, className: "animate-spin text-accent" },
  success: { icon: CheckCircle2, className: "text-success" },
  failed: { icon: XCircle, className: "text-danger" },
  skipped: { icon: MinusCircle, className: "text-text-faint" },
  cancelled: { icon: Ban, className: "text-warning" },
};

export const RUN_STATUS: Record<AutomationRun["status"], { label: string; tone: "accent" | "success" | "danger" | "warning" }> = {
  running: { label: tm("Rodando"), tone: "accent" },
  success: { label: tm("Sucesso"), tone: "success" },
  failed: { label: tm("Falhou"), tone: "danger" },
  cancelled: { label: tm("Cancelada"), tone: "warning" },
};

/** Passos de uma execução com status, duração e saída expansível. */
export function RunView({ run }: { run: AutomationRun }) {
  const [open, setOpen] = useState<number | null>(() => {
    const failed = run.steps.findIndex((s) => s.status === "failed");
    return failed >= 0 ? failed : null;
  });
  return (
    <div className="space-y-1.5">
      {run.error && <p className="rounded-md bg-danger/10 px-2.5 py-1.5 text-xs text-danger">{run.error}</p>}
      {run.steps.map((s, i) => {
        const st = STATUS_ICON[s.status];
        const output = [s.stdout, s.stderr].filter((t) => t.trim()).join("\n");
        return (
          <div key={i} className="overflow-hidden rounded-lg border border-border-subtle">
            <button
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-bg-hover disabled:cursor-default disabled:hover:bg-transparent"
              onClick={() => setOpen(open === i ? null : i)}
              disabled={!output}
            >
              <st.icon size={14} className={cn("shrink-0", st.className)} />
              <span className="min-w-0 flex-1 truncate font-mono text-text">{stepText(s.step)}</span>
              {s.exitCode !== null && s.exitCode !== 0 && <Badge tone="danger">{tr("código {code}", { code: s.exitCode })}</Badge>}
              {s.durationMs > 0 && <span className="shrink-0 tabular-nums text-[11px] text-text-faint">{(s.durationMs / 1000).toFixed(1)}s</span>}
            </button>
            {open === i && output && (
              <pre className="max-h-60 overflow-auto border-t border-border-subtle bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-text-muted">{output}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Confirmar e acompanhar uma execução. A confirmação mostra cada passo com o
 * risco calculado pelo main; nada roda antes do clique em "Executar".
 */
export function RunAutomationDialog({ automation, onClose, onDone }: { automation: Automation | null; onClose: () => void; onDone?: () => void }) {
  const [run, setRun] = useState<AutomationRun | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    setRun(null);
    setStarting(false);
  }, [automation?.id]);

  useEffect(() => {
    if (!automation) return;
    return window.workspace.automations.onProgress((r) => {
      if (r.automationId === automation.id) setRun(r);
    });
  }, [automation]);

  if (!automation) return null;
  const dangerous = automation.steps.filter((s) => s.assessment.risk === "dangerous");
  const finished = run !== null && run.status !== "running";

  async function execute() {
    if (!automation) return;
    setStarting(true);
    const result = await attempt(window.workspace.automations.run(automation.id, true));
    setStarting(false);
    if (result) setRun(result);
    onDone?.();
  }

  return (
    <Dialog
      open
      onClose={() => (run?.status === "running" ? undefined : onClose())}
      dismissable={!run || finished}
      size="lg"
      danger={!run && dangerous.length > 0}
      title={run ? automation.name : tr("Executar \"{name}\"?", { name: automation.name })}
      description={
        run ? (
          <Badge tone={RUN_STATUS[run.status].tone}>{tr(RUN_STATUS[run.status].label)}</Badge>
        ) : (
          trn(automation.steps.length, "{n} passo, na pasta do projeto. Para no primeiro erro.", "{n} passos, em ordem, na pasta do projeto. Para no primeiro erro.")
        )
      }
      footer={
        run ? (
          run.status === "running" ? (
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => void attempt(window.workspace.automations.cancel(automation.id))}>
              <Ban size={13} /> {tr("Cancelar execução")}
            </Button>
          ) : (
            <Button size="sm" className="ml-auto" onClick={onClose}>
              {tr("Fechar")}
            </Button>
          )
        ) : (
          <>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
              {tr("Cancelar")}
            </Button>
            <Button size="sm" variant={dangerous.length > 0 ? "danger" : "default"} onClick={() => void execute()} loading={starting}>
              <Play size={13} /> {tr("Executar")}
            </Button>
          </>
        )
      }
    >
      {run ? (
        <RunView run={run} />
      ) : (
        <div className="space-y-3">
          {dangerous.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-text">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
              <p>
                {trn(
                  dangerous.length,
                  "Um passo pode apagar ou alterar dados. Confira o comando antes de executar.",
                  "{n} passos podem apagar ou alterar dados. Confira os comandos antes de executar."
                )}
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            {automation.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-border-subtle px-2.5 py-1.5">
                <span className="mt-0.5 w-4 shrink-0 text-right text-[11px] text-text-faint">{i + 1}</span>
                <StepIcon step={s} />
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-xs text-text">{stepText(s)}</p>
                  {s.assessment.reasons.length > 0 && <p className="text-[11px] text-danger">{s.assessment.reasons.map((r) => tr(r)).join(" · ")}</p>}
                </div>
                {s.kind === "command" && <Badge tone={RISK_TONE[s.assessment.risk]}>{tr(RISK_LABEL[s.assessment.risk])}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
