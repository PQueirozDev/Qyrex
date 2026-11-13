import { useEffect, useState } from "react";
import { Bot, Send, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { tr } from "@/lib/i18n";
import { useAssist } from "@/lib/useAssist";
import { useBuddyStore } from "@/stores/useBuddyStore";
import { useUIStore } from "@/stores/useUIStore";
import { localAnswer, QUICK_QUESTIONS, type QuickQuestion } from "./answers";

/** Painel aberto ao clicar: respostas locais para as perguntas prontas e pergunta livre à IA (com consentimento). */
export default function BuddyPanel({ onClose }: { onClose: () => void }) {
  const navigate = useUIStore((s) => s.navigate);
  const { prefs, react } = useBuddyStore();
  const [answer, setAnswer] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const assist = useAssist();

  useEffect(() => {
    if (assist.running) react({ kind: "thinking" });
    else react({ kind: "answered" });
  }, [assist.running, react]);

  const ask = async (q: QuickQuestion) => {
    setAnswer(null);
    react({ kind: "thinking" });
    setAnswer(await localAnswer(q));
    react({ kind: "answered" });
  };

  return (
    <div className="w-[340px] overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-pop" role="dialog" aria-label={tr("Capivara assistente")}>
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <span className="text-[13px] font-medium text-text">{tr("Posso ajudar?")}</span>
        <span className="flex gap-0.5">
          <Button size="icon-sm" variant="ghost" onClick={() => navigate("configuracoes")} aria-label={tr("Configurar a capivara")} title={tr("Configurar a capivara")}>
            <Settings2 size={12} />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label={tr("Fechar")}>
            <X size={13} />
          </Button>
        </span>
      </div>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto p-3">
        <div className="flex flex-wrap gap-1">
          {QUICK_QUESTIONS.map((q) => (
            <button key={q.id} onClick={() => void ask(q.id)} className="rounded-full border border-border-subtle px-2.5 py-1 text-[11.5px] text-text-muted hover:border-accent/50 hover:text-text">
              {q.label()}
            </button>
          ))}
        </div>
        {(answer || assist.text || assist.error) && (
          <div className="whitespace-pre-wrap rounded-lg bg-bg px-3 py-2 text-[12.5px] leading-relaxed text-text">
            {assist.error ? <span className="text-danger">{assist.error}</span> : assist.text || answer}
          </div>
        )}
        <p className="text-[10.5px] text-text-faint">{tr("As respostas rápidas usam só os dados deste PC e não saem dele.")}</p>
        {prefs.ai && (
          <form
            className="space-y-1.5 border-t border-border-subtle pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!question.trim() || !consent) return;
              setAnswer(null);
              void assist.start((id) => window.workspace.assist.buddy(id, question.trim(), true));
            }}
          >
            <div className="flex gap-1.5">
              <input className="input py-1 text-xs" placeholder={tr("Pergunte outra coisa à IA...")} value={question} onChange={(e) => setQuestion(e.target.value)} />
              <Button type="submit" size="icon" variant="secondary" disabled={!question.trim() || !consent || assist.running} aria-label={tr("Perguntar")}>
                <Send size={12} />
              </Button>
            </div>
            <label className="flex items-start gap-1.5 text-[10.5px] text-text-muted">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-px" />
              {tr("Enviar à IA conectada um resumo das minhas tarefas, projetos e processos (sem arquivos nem segredos).")}
            </label>
          </form>
        )}
        <Button size="xs" variant="ghost" onClick={() => navigate("ia")}>
          <Bot size={12} /> {tr("Abrir a Central de IA")}
        </Button>
      </div>
    </div>
  );
}
