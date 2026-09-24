import { useEffect, useState } from "react";
import { Star, Terminal, FolderCode, FolderOpen, Github, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useProjectsStore } from "@/stores/useProjectsStore";

export function Projects() {
  const { projects, load, createProject, toggleFavorite, error } = useProjectsStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const ok = await createProject({ name, localPath });
    if (ok) {
      setDialogOpen(false);
      setName("");
      setLocalPath("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Projetos</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={14} /> Novo projeto
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-text">{project.name}</h3>
                  <p className="text-xs text-text-faint">
                    {project.technologies.join(" • ") || "Sem tecnologias detectadas"}
                  </p>
                </div>
                <button onClick={() => toggleFavorite(project.id)} aria-label="Favoritar">
                  <Star
                    size={15}
                    className={project.favorite ? "fill-warning text-warning" : "text-text-faint"}
                  />
                </button>
              </div>

              {project.git?.isRepo && (
                <p className="mt-2 text-xs text-text-faint">
                  Branch: <span className="text-text-muted">{project.git.branch}</span>
                  {project.git.modifiedCount > 0 && (
                    <> • Git: {project.git.modifiedCount} arquivo(s) modificado(s)</>
                  )}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.workspace.system.openVSCode(project.localPath)}
                >
                  <FolderCode size={13} /> VS Code
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.workspace.system.openTerminal(project.localPath)}
                >
                  <Terminal size={13} /> Terminal
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.workspace.system.openExplorer(project.localPath)}
                >
                  <FolderOpen size={13} /> Pasta
                </Button>
                {project.githubUrl && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => window.workspace.system.openExternalUrl(project.githubUrl!)}
                  >
                    <Github size={13} /> GitHub
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {projects.length === 0 && (
          <p className="text-sm text-text-faint">
            Nenhum projeto cadastrado ainda. Clique em "Novo projeto" para adicionar um.
          </p>
        )}
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Novo projeto">
        <div className="space-y-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do projeto"
            className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="Caminho local (dentro de um diretório autorizado)"
            className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-xs text-text-faint">
            O caminho precisa estar dentro de um diretório autorizado em Configurações.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!name || !localPath}>
              Criar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
