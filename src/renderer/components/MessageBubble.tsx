import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Bot, Check, Copy, Paperclip, Play, User } from "lucide-react";
import type { AIMessageRole, AttachedFileRef, CommandAssessment, CommandRunResult } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { toast } from "@/stores/useUIStore";

import { tr } from "@/lib/i18n";
/** Linguagens de bloco de código que podem ser executadas (sempre via PowerShell, com confirmação). */
const RUNNABLE = new Set(["powershell", "ps", "ps1", "pwsh", "bash", "sh", "shell", "cmd", "bat", "console"]);

interface RunContext {
  /** Pasta onde o comando roda (o projeto da conversa). Sem ela, não há execução. */
  cwd: string | null;
  /** Quem sugeriu o comando, para o diálogo ("Claude deseja executar: ..."). */
  assistantLabel: string;
}

type Assessment = CommandAssessment & { alwaysAllowed: boolean };

const RISK_LABEL = { safe: "Seguro", normal: "Normal", dangerous: "Perigoso" } as const;
const RISK_TONE = { safe: "success", normal: "neutral", dangerous: "danger" } as const;

function RunCommandDialog({
  command,
  cwd,
  assistantLabel,
  assessment,
  onCancel,
  onDecide,
}: {
  command: string;
  cwd: string;
  assistantLabel: string;
  assessment: Assessment;
  onCancel: () => void;
  onDecide: (decision: "once" | "always") => void;
}) {
  const dangerous = assessment.risk === "dangerous";
  return (
    <Dialog
      open
      danger={dangerous}
      onClose={onCancel}
      title={tr("{name} deseja executar:", { name: assistantLabel })}
      description={dangerous ? tr("Este comando pode apagar, sobrescrever ou alterar algo de forma irreversível. Revise com atenção.") : undefined}
      footer={
        dangerous ? (
          <>
            <Button size="sm" variant="ghost" onClick={onCancel} data-autofocus>{tr("Cancelar")}</Button>
            <Button size="sm" variant="danger" onClick={() => onDecide("once")}>{tr("Confirmar")}</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onCancel}>{tr("Cancelar")}</Button>
            <Button size="sm" variant="secondary" onClick={() => onDecide("once")} data-autofocus>{tr("Permitir uma vez")}</Button>
            <Button size="sm" onClick={() => onDecide("always")} title={tr("Não perguntar de novo para este comando exato")}>{tr("Permitir sempre")}</Button>
          </>
        )
      }
    >
      <div className="space-y-2">
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border-subtle bg-bg px-3 py-2 font-mono text-xs text-text">
          {command}
        </pre>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <Badge tone={RISK_TONE[assessment.risk]}>{tr("Risco:")}{" "}{RISK_LABEL[assessment.risk]}</Badge>
          <span>{tr("em")}{" "}<span className="font-mono text-text">{cwd}</span>{" "}{tr("(PowerShell)")}</span>
        </div>
        {assessment.reasons.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-text-muted">
            {assessment.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function RunOutput({ result }: { result: CommandRunResult }) {
  const ok = result.exitCode === 0 && !result.timedOut;
  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-border-subtle">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-bg-elevated px-3 py-1 text-[11px]">
        <span className={ok ? "text-success" : "text-danger"}>
          {result.timedOut ? tr("Tempo esgotado") : tr("Código de saída {code}", { code: result.exitCode ?? "?" })}
        </span>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-bg px-3 py-2 font-mono text-[11px] text-text">
        {result.stdout || (!result.stderr && <span className="text-text-faint">{tr("(sem saída)")}</span>)}
        {result.stderr && <span className="text-danger">{result.stderr}</span>}
      </pre>
    </div>
  );
}

function CodeBlock({ children, className, run }: ComponentProps<"code"> & { node?: unknown; run: RunContext | null }) {
  const [copied, setCopied] = useState(false);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CommandRunResult | null>(null);

  const text = String(children).replace(/\n$/, "");
  const language = /language-([\w-]+)/.exec(className ?? "")?.[1]?.toLowerCase();
  const isBlock = Boolean(language) || text.includes("\n");

  if (!isBlock) {
    return <code className="rounded bg-bg-elevated px-1 py-0.5 text-[13px]">{children}</code>;
  }

  const runnable = run !== null && language !== undefined && RUNNABLE.has(language);

  async function requestRun() {
    if (!run?.cwd) {
      toast.error(tr("Vincule um projeto à conversa para executar comandos na pasta dele."));
      return;
    }
    const a = await attempt(window.workspace.commands.assess(text));
    if (!a) return;
    // Pré-autorizado com "Permitir sempre" (nunca vale para comandos perigosos).
    if (a.alwaysAllowed && a.risk !== "dangerous") void execute("once");
    else setAssessment(a);
  }

  async function execute(decision: "once" | "always") {
    if (!run?.cwd) return;
    setAssessment(null);
    setRunning(true);
    const out = await attempt(window.workspace.commands.run({ command: text, cwd: run.cwd, decision, confirmed: true }));
    setRunning(false);
    if (out) setResult(out);
  }

  return (
    <div className="not-prose my-2">
      <div className="group relative">
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {runnable && (
            <Button size="xs" variant="secondary" onClick={() => void requestRun()} loading={running}>
              {!running && <Play size={11} />}{" "}{tr("Executar")}</Button>
          )}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-md border border-border bg-bg-elevated p-1 text-text-faint hover:text-text"
            aria-label={tr("Copiar código")}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
        <pre className={cn("overflow-x-auto rounded-lg border border-border-subtle bg-bg-elevated p-3 text-[13px]", className)}>
          <code className={className}>{children}</code>
        </pre>
      </div>
      {result && <RunOutput result={result} />}
      {assessment && run?.cwd && (
        <RunCommandDialog
          command={text}
          cwd={run.cwd}
          assistantLabel={run.assistantLabel}
          assessment={assessment}
          onCancel={() => setAssessment(null)}
          onDecide={(d) => void execute(d)}
        />
      )}
    </div>
  );
}

interface MessageBubbleProps {
  role: AIMessageRole;
  content: string;
  attachedFiles?: AttachedFileRef[];
  /** Habilita o botão "Executar" nos blocos de shell das respostas da IA. */
  run?: RunContext | null;
  footer?: ReactNode;
}

export function MessageBubble({ role, content, attachedFiles = [], run = null, footer }: MessageBubbleProps) {
  const isUser = role === "user";
  const cwd = run?.cwd ?? null;
  const assistantLabel = run?.assistantLabel ?? "";
  // Componentes estáveis: se fossem recriados a cada render, cada bloco de código
  // seria remontado (perdendo a saída de um comando já executado).
  const components = useMemo<Components>(() => {
    const ctx = run ? { cwd, assistantLabel } : null;
    return {
      pre: ({ children }) => <>{children}</>,
      code: (props) => <CodeBlock {...props} run={ctx} />,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run === null, cwd, assistantLabel]);

  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-accent-muted text-accent" : "border border-border-subtle bg-bg-card text-text-muted"
        )}
      >
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>

      <div className={cn("flex min-w-0 max-w-[80%] flex-col gap-1.5", isUser && "items-end")}>
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachedFiles.map((f) => (
              <span
                key={f.path}
                title={f.path}
                className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-card px-1.5 py-0.5 text-[11px] text-text-faint"
              >
                <Paperclip size={10} /> {f.name}
              </span>
            ))}
          </div>
        )}

        <div
          className={cn(
            "min-w-0 rounded-card px-3.5 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-accent-muted text-text" : "border border-border-subtle bg-bg-card text-text",
            "prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={components}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
        {footer}
      </div>
    </div>
  );
}
