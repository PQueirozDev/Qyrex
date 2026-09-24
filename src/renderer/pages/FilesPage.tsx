import { useEffect, useState } from "react";
import { Folder, File, FolderPlus, Trash2, FolderCode, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { DirEntry } from "@shared/types";

export function FilesPage() {
  const { settings, load: loadSettings } = useSettingsStore();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DirEntry | null>(null);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!currentPath && settings?.allowedProjectDirs?.[0]) {
      setCurrentPath(settings.allowedProjectDirs[0]);
    }
  }, [settings, currentPath]);

  useEffect(() => {
    if (!currentPath) return;
    void refresh(currentPath);
  }, [currentPath]);

  async function refresh(path: string) {
    const res = await window.workspace.files.list(path);
    if (res.ok) {
      setEntries(res.data);
      setError(null);
    } else {
      setError(res.error);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const res = await window.workspace.files.delete(toDelete.path, true);
    setToDelete(null);
    if (res.ok && currentPath) void refresh(currentPath);
  }

  if (!settings?.allowedProjectDirs?.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <h2 className="text-lg font-semibold text-text">Nenhuma pasta autorizada</h2>
        <p className="max-w-sm text-sm text-text-muted">
          Adicione um diretório autorizado em Configurações → Projetos para o Workspace
          conseguir acessar seus arquivos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm text-text-muted">
          <span>{currentPath}</span>
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const name = window.prompt("Nome da nova pasta:");
              if (name && currentPath) {
                const res = await window.workspace.files.createFolder(currentPath, name);
                if (res.ok) void refresh(currentPath);
              }
            }}
          >
            <FolderPlus size={13} /> Nova pasta
          </Button>
          {currentPath && (
            <Button size="sm" variant="secondary" onClick={() => window.workspace.system.openExplorer(currentPath)}>
              Abrir no Explorer
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card className="divide-y divide-border-subtle">
        {entries.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-text-faint">Pasta vazia.</p>
        )}
        {entries.map((entry) => (
          <div key={entry.path} className="flex items-center gap-2.5 px-4 py-2.5">
            {entry.isDirectory ? (
              <Folder size={15} className="text-accent" />
            ) : (
              <File size={15} className="text-text-faint" />
            )}
            <button
              className="flex-1 truncate text-left text-sm text-text hover:underline"
              onClick={() => entry.isDirectory && setCurrentPath(entry.path)}
            >
              {entry.name}
            </button>
            {entry.isDirectory && <ChevronRight size={13} className="text-text-faint" />}
            {!entry.isDirectory && (
              <span className="text-[11px] text-text-faint">{(entry.size / 1024).toFixed(1)} KB</span>
            )}
            {entry.isDirectory && (
              <button onClick={() => window.workspace.system.openVSCode(entry.path)} aria-label="Abrir no VS Code">
                <FolderCode size={14} className="text-text-faint hover:text-text" />
              </button>
            )}
            <button onClick={() => setToDelete(entry)} aria-label="Excluir">
              <Trash2 size={14} className="text-text-faint hover:text-danger" />
            </button>
          </div>
        ))}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title={`Excluir "${toDelete?.name}"?`}
        description="Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
