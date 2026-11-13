import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Copy, RefreshCw, Square } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { LoadingRows } from "@/components/ui/primitives";
import { tr } from "@/lib/i18n";
import { useAssist } from "@/lib/useAssist";
import { toast } from "@/stores/useUIStore";

/**
 * Resumo para a daily: a IA lê os seus commits (todos os projetos) e as tarefas
 * desde o último dia útil e escreve "Ontem / Hoje / Bloqueios". Só texto para copiar.
 * Carregado sob demanda (usa o renderizador de Markdown).
 */
export default function DailyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { text, running, error, start, stop } = useAssist();
  const generate = () => void start((id) => window.workspace.assist.daily(id));

  useEffect(() => {
    if (open) generate();
    // Gera uma vez a cada abertura do diálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text.trim());
      toast.success(tr("Copiado"));
    } catch {
      toast.error(tr("Não foi possível copiar."));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        stop();
        onClose();
      }}
      size="lg"
      title={tr("Resumo para a daily")}
      description={tr("Seus commits e tarefas desde o último dia útil, resumidos pela IA conectada.")}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {running ? (
            <Button size="sm" variant="ghost" onClick={stop}>
              <Square size={11} /> {tr("Parar")}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={generate}>
              <RefreshCw size={12} /> {tr("Gerar de novo")}
            </Button>
          )}
          <Button size="sm" onClick={() => void copy()} disabled={!text.trim() || running}>
            <Copy size={12} /> {tr("Copiar")}
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>
      ) : !text ? (
        <LoadingRows rows={4} />
      ) : (
        <div className="prose prose-sm max-w-none text-text dark:prose-invert prose-headings:text-text prose-strong:text-text prose-li:my-0.5">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      )}
    </Dialog>
  );
}
