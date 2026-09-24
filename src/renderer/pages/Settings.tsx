import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useSettingsStore } from "@/stores/useSettingsStore";

export function Settings() {
  const { settings, load, update, addAllowedDir, removeAllowedDir } = useSettingsStore();
  const [newDir, setNewDir] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings) return null;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold text-text">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Geral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm text-text-muted">
            Nome
            <input
              value={settings.userName}
              onChange={(e) => update({ userName: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={settings.minimizeToTray}
              onChange={(e) => update({ minimizeToTray: e.target.checked })}
              className="accent-accent"
            />
            Minimizar para a bandeja do sistema ao fechar
          </label>

          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={settings.startWithSystem}
              onChange={(e) => update({ startWithSystem: e.target.checked })}
              className="accent-accent"
            />
            Iniciar com o Windows
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terminal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(["powershell", "cmd"] as const).map((t) => (
              <button
                key={t}
                onClick={() => update({ defaultTerminal: t })}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  settings.defaultTerminal === t
                    ? "border-accent bg-accent-muted text-text"
                    : "border-border text-text-muted"
                }`}
              >
                {t === "powershell" ? "PowerShell" : "CMD"}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diretórios autorizados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-text-faint">
            O Workspace só pode abrir, listar ou modificar arquivos dentro destas pastas.
          </p>
          {settings.allowedProjectDirs.length === 0 && (
            <p className="text-sm text-text-faint">Nenhum diretório autorizado ainda.</p>
          )}
          {settings.allowedProjectDirs.map((dir) => (
            <div key={dir} className="flex items-center justify-between rounded-md border border-border-subtle px-2.5 py-1.5">
              <span className="truncate text-sm text-text-muted">{dir}</span>
              <button onClick={() => removeAllowedDir(dir)} aria-label="Remover">
                <Trash2 size={14} className="text-text-faint hover:text-danger" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input
              value={newDir}
              onChange={(e) => setNewDir(e.target.value)}
              placeholder="C:\Projetos"
              className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <Button
              size="sm"
              onClick={() => {
                if (newDir.trim()) {
                  void addAllowedDir(newDir.trim());
                  setNewDir("");
                }
              }}
            >
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
