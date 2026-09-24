import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Folder, File, ChevronRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { DirEntry, AttachedFileRef } from "@shared/types";

interface AttachFilesDialogProps {
  open: boolean;
  rootPath: string;
  initiallySelected: AttachedFileRef[];
  onClose: () => void;
  onConfirm: (files: AttachedFileRef[]) => void;
}

/**
 * Navega SOMENTE dentro de `rootPath` (o projeto escolhido na conversa).
 * Nada é enviado para a IA sem o usuário marcar explicitamente o arquivo aqui
 * e confirmar — ver spec seção 5, "sistema de permissões".
 */
export function AttachFilesDialog({
  open,
  rootPath,
  initiallySelected,
  onClose,
  onConfirm,
}: AttachFilesDialogProps) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [selected, setSelected] = useState<Map<string, AttachedFileRef>>(
    new Map(initiallySelected.map((f) => [f.path, f]))
  );

  useEffect(() => {
    if (open) setCurrentPath(rootPath);
  }, [open, rootPath]);

  useEffect(() => {
    if (!open) return;
    void window.workspace.files.list(currentPath).then((res) => {
      if (res.ok) setEntries(res.data);
    });
  }, [open, currentPath]);

  if (!open) return null;

  function toggle(entry: DirEntry) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.set(entry.path, { path: entry.path, name: entry.name });
      return next;
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-card border border-border bg-bg-elevated shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-3.5 py-2.5">
          {currentPath !== rootPath && (
            <button onClick={() => setCurrentPath((p) => p.split(/[\\/]/).slice(0, -1).join("/"))}>
              <ArrowLeft size={14} className="text-text-faint" />
            </button>
          )}
          <span className="truncate text-xs text-text-faint">{currentPath}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {entries.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-bg-card"
            >
              {!entry.isDirectory && (
                <input
                  type="checkbox"
                  checked={selected.has(entry.path)}
                  onChange={() => toggle(entry)}
                  className="h-3.5 w-3.5 accent-accent"
                />
              )}
              {entry.isDirectory ? (
                <Folder size={14} className="text-accent" />
              ) : (
                <File size={14} className="text-text-faint" />
              )}
              <button
                className={cn("flex-1 truncate text-left text-sm text-text")}
                onClick={() => entry.isDirectory && setCurrentPath(entry.path)}
              >
                {entry.name}
              </button>
              {entry.isDirectory && <ChevronRight size={13} className="text-text-faint" />}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle px-3.5 py-2.5">
          <span className="text-xs text-text-faint">{selected.size} arquivo(s) selecionado(s)</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => onConfirm(Array.from(selected.values()))}>
              Anexar
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
