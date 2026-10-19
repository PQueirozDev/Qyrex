import { useEffect, useState } from "react";
import { BookMarked, BookmarkPlus, Pencil, Trash2 } from "lucide-react";
import type { SavedPrompt } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { confirmAction } from "@/stores/useUIStore";
import { tm } from "@shared/i18n";

/**
 * Modelos prontos (fixos, traduzidos) para os usos mais comuns. Inserir só
 * preenche o campo: o usuário completa e decide enviar.
 */
const BUILT_IN: { title: string; content: string }[] = [
  { title: tm("Explicar código"), content: tm("Explique o que este código faz, passo a passo, e aponte pontos que podem dar problema:\n\n") },
  { title: tm("Corrigir um erro"), content: tm("Recebi este erro. Explique a causa provável e proponha a correção mínima:\n\nErro:\n\nCódigo relacionado:\n") },
  { title: tm("Analisar log"), content: tm("Analise este log. Resuma o que aconteceu, destaque erros e avisos relevantes e sugira o próximo passo:\n\n") },
  { title: tm("Planejar tarefa"), content: tm("Quero implementar o seguinte. Quebre em passos pequenos e verificáveis, com os arquivos que provavelmente mudam:\n\n") },
  { title: tm("Sugerir melhorias"), content: tm("Revise este trecho e sugira melhorias de legibilidade, desempenho e segurança, sem mudar o comportamento:\n\n") },
  { title: tm("Resumir alterações"), content: tm("Resuma estas alterações (diff) em linguagem simples e sugira uma mensagem de commit curta:\n\n") },
];

function EditPromptDialog({ prompt, initialContent, onClose, onSaved }: { prompt: SavedPrompt | null; initialContent: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(prompt?.title ?? "");
  const [content, setContent] = useState(prompt?.content ?? initialContent);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const ok = prompt
      ? await attempt(window.workspace.prompts.update(prompt.id, { title: title.trim(), content }), tr("Prompt salvo"))
      : await attempt(window.workspace.prompts.create({ title: title.trim(), content }), tr("Prompt salvo"));
    setSaving(false);
    if (ok) {
      onSaved();
      onClose();
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={prompt ? tr("Editar prompt") : tr("Salvar como prompt")}
      footer={
        <>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            {tr("Cancelar")}
          </Button>
          <Button size="sm" onClick={() => void save()} loading={saving} disabled={!title.trim() || !content.trim()}>
            {tr("Salvar")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={tr("Nome")}>
          <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={tr("Texto")}>
          <textarea className="input min-h-[140px] resize-y font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Botão "Prompts" do compositor: modelos prontos, prompts salvos e salvar o texto atual. */
export function PromptLibraryButton({ draft, onInsert }: { draft: string; onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedPrompt[]>([]);
  const [editing, setEditing] = useState<SavedPrompt | "new" | null>(null);

  const load = () => void attempt(window.workspace.prompts.list()).then((list) => setSaved(list ?? []));
  useEffect(() => {
    if (open) load();
  }, [open]);

  function insert(text: string, id?: string) {
    // Se já há texto, o prompt entra antes dele (o texto vira o conteúdo a analisar).
    onInsert(draft.trim() ? `${text}${draft}` : text);
    if (id) void window.workspace.prompts.used(id);
    setOpen(false);
  }

  async function remove(p: SavedPrompt) {
    const ok = await confirmAction({ title: tr("Excluir o prompt \"{name}\"?", { name: p.title }), danger: true, confirmLabel: tr("Excluir") });
    if (!ok) return;
    await attempt(window.workspace.prompts.delete(p.id));
    load();
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title={tr("Prompts reutilizáveis")}>
        <BookMarked size={13} /> {tr("Prompts")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={tr("Prompts")}
        description={tr("Escolha um modelo para preencher a mensagem. Nada é enviado até você clicar em Enviar.")}
        footer={
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setEditing("new")} disabled={!draft.trim()} title={draft.trim() ? undefined : tr("Escreva uma mensagem para salvar")}>
            <BookmarkPlus size={13} /> {tr("Salvar mensagem atual como prompt")}
          </Button>
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="section-title mb-2">{tr("Modelos")}</p>
            <div className="space-y-1">
              {BUILT_IN.map((b) => (
                <button key={b.title} onClick={() => insert(tr(b.content))} className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-bg-hover">
                  <p className="text-sm text-text">{tr(b.title)}</p>
                  <p className="truncate text-[11px] text-text-faint">{tr(b.content).split("\n")[0]}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="section-title mb-2">{tr("Meus prompts")}</p>
            {saved.length === 0 ? (
              <p className="text-xs text-text-faint">{tr("Nenhum prompt salvo. Escreva uma mensagem e salve para reaproveitar depois.")}</p>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {saved.map((p) => (
                  <div key={p.id} className="group flex items-start gap-1 rounded-md hover:bg-bg-hover">
                    <button onClick={() => insert(p.content, p.id)} className="min-w-0 flex-1 px-2 py-1.5 text-left">
                      <p className="truncate text-sm text-text">{p.title}</p>
                      <p className="truncate text-[11px] text-text-faint">{p.content.split("\n")[0]}</p>
                    </button>
                    <Button size="icon-sm" variant="ghost" className="mt-1 opacity-0 group-hover:opacity-100" onClick={() => setEditing(p)} title={tr("Editar")} aria-label={tr("Editar")}>
                      <Pencil size={12} />
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="mt-1 opacity-0 group-hover:opacity-100" onClick={() => void remove(p)} title={tr("Excluir")} aria-label={tr("Excluir")}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>
      {editing && <EditPromptDialog prompt={editing === "new" ? null : editing} initialContent={draft} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}
