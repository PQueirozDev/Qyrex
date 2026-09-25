import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, File, Folder, X } from "lucide-react";
import type { AttachedFileRef, DirEntry } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/primitives";
import { errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";

import { tr } from "@/lib/i18n";
interface AttachFilesDialogProps {
  open: boolean;
  rootPath: string;
  initiallySelected: AttachedFileRef[];
  onClose: () => void;
  onConfirm: (files: AttachedFileRef[]) => void;
}

const MAX_FILES = 20;

/**
 * Navega SOMENTE dentro de `rootPath` (o projeto da conversa). Nada vai para a
 * IA sem o usuário marcar o arquivo aqui e confirmar — e a lista do que será
 * enviado fica visível antes do envio.
 */
export function AttachFilesDialog({ open, rootPath, initiallySelected, onClose, onConfirm }: AttachFilesDialogProps) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, AttachedFileRef>>(new Map());

  useEffect(() => {
    if (!open) return;
    setCurrentPath(rootPath);
    setSelected(new Map(initiallySelected.map((f) => [f.path, f])));
  }, [open, rootPath, initiallySelected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    unwrap(window.workspace.files.list(currentPath))
      .then((list) => {
        if (!cancelled) setEntries([...list].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, "pt-BR")));
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [open, currentPath]);

  function toggle(entry: DirEntry) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else if (next.size < MAX_FILES) next.set(entry.path, { path: entry.path, name: entry.name });
      return next;
    });
  }

  const relative = currentPath.slice(rootPath.length).replace(/^[\\/]+/, "");
  const goUp = () => {
    const parts = currentPath.split(/[\\/]/);
    parts.pop();
    const parent = parts.join(currentPath.includes("\\") ? "\\" : "/");
    // Nunca sai da raiz do projeto.
    setCurrentPath(parent.length >= rootPath.length ? parent : rootPath);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={tr("Anexar arquivos do projeto")}
      description={tr("Só os arquivos marcados são lidos e enviados para a IA junto com a mensagem.")}
      footer={
        <>
          <span className="mr-auto text-xs text-text-faint">
            {tr("{n} de até {max} arquivo(s)", { n: selected.size, max: MAX_FILES })}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>{tr("Cancelar")}</Button>
          <Button size="sm" onClick={() => onConfirm(Array.from(selected.values()))}>{tr("Confirmar anexos")}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Button size="icon-sm" variant="ghost" onClick={goUp} disabled={currentPath === rootPath} aria-label={tr("Voltar")}>
            <ArrowLeft size={13} />
          </Button>
          <span className="truncate font-mono">{relative ? `./${relative.replace(/\\/g, "/")}` : "./"}</span>
        </div>

        <div className="max-h-[42vh] overflow-y-auto rounded-lg border border-border-subtle">
          {error ? (
            <div className="p-3">
              <ErrorState message={error} />
            </div>
          ) : entries === null ? (
            <div className="p-3">
              <LoadingRows />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState className="py-6" icon={Folder} title={tr("Pasta vazia")} />
          ) : (
            entries.map((entry) => {
              const checked = selected.has(entry.path);
              return (
                <div
                  key={entry.path}
                  onClick={() => (entry.isDirectory ? setCurrentPath(entry.path) : toggle(entry))}
                  className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-bg-hover/60", checked && "bg-accent/5")}
                >
                  {entry.isDirectory ? (
                    <Folder size={14} className="shrink-0 text-accent" />
                  ) : (
                    <input type="checkbox" readOnly checked={checked} className="h-3.5 w-3.5 shrink-0 accent-accent" tabIndex={-1} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-text">{entry.name}</span>
                  {entry.isDirectory ? (
                    <ChevronRight size={13} className="text-text-faint" />
                  ) : (
                    <span className="text-[11px] text-text-faint">{formatBytes(entry.size)}</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {selected.size > 0 && (
          <div>
            <p className="section-title mb-1.5">{tr("Serão enviados")}</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selected.values()).map((f) => (
                <span key={f.path} title={f.path} className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg px-1.5 py-0.5 text-[11px] text-text">
                  <File size={10} className="text-text-faint" /> {f.name}
                  <button
                    onClick={() =>
                      setSelected((prev) => {
                        const next = new Map(prev);
                        next.delete(f.path);
                        return next;
                      })
                    }
                    className="text-text-faint hover:text-danger"
                    aria-label={`Remover ${f.name}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
