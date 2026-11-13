import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, FolderPlus, Link2, PackagePlus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import type { PluginPermission, ProjectTemplate, QuickLink } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, EmptyState, Field, PageHeader, Switch } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { tr, trn } from "@/lib/i18n";
import { PAGE_ICONS } from "@/lib/pageIcons";
import { usePluginsStore } from "@/stores/usePluginsStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { confirmAction, toast, useUIStore } from "@/stores/useUIStore";

const DOCS_URL = "https://github.com/PQueirozDev/Qyrex/blob/main/docs/PLUGINS.md";
/** Textos dos embutidos são chaves de tradução; os de terceiros aparecem como vieram. */
const text = (source: "builtin" | "local", value: string) => (source === "builtin" ? tr(value) : value);

function QuickLinksManager() {
  const [links, setLinks] = useState<QuickLink[] | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const load = () => void attempt(window.workspace.quickLinks.list(null)).then((l) => setLinks(l ?? []));
  useEffect(load, []);
  const add = async () => {
    const ok = await attempt(window.workspace.quickLinks.add({ title: title.trim(), url: url.trim() }), tr("Link adicionado"));
    if (ok) {
      setTitle("");
      setUrl("");
      load();
    }
  };
  return (
    <div className="space-y-2">
      {links?.length === 0 && <p className="text-xs text-text-faint">{tr("Nenhum link ainda. Eles aparecem na paleta de comandos (Ctrl+K).")}</p>}
      <ul className="space-y-0.5">
        {links?.map((l) => (
          <li key={l.id} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-bg-hover">
            <Link2 size={12} className="shrink-0 text-text-faint" />
            <button className="min-w-0 truncate text-left text-text hover:underline" onClick={() => void attempt(window.workspace.system.openExternalUrl(l.url))}>
              {l.title}
            </button>
            <span className="min-w-0 flex-1 truncate text-[11px] text-text-faint">{l.url}</span>
            {l.pluginId ? (
              <Badge>{l.pluginId}</Badge>
            ) : (
              <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => void attempt(window.workspace.quickLinks.remove(l.id)).then(load)} aria-label={tr("Remover")}>
                <Trash2 size={11} />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && url.trim()) void add();
        }}
      >
        <input className="input w-40 py-1 text-xs" placeholder={tr("Título")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input min-w-[200px] flex-1 py-1 text-xs" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button type="submit" size="sm" variant="secondary" disabled={!title.trim() || !url.trim()}>
          {tr("Adicionar")}
        </Button>
      </form>
    </div>
  );
}

function TemplateDialog({ template, onClose }: { template: (ProjectTemplate & { pluginId: string }) | null; onClose: () => void }) {
  const settings = useSettingsStore((s) => s.settings);
  const reload = useProjectsStore((s) => s.load);
  const navigate = useUIStore((s) => s.navigate);
  const dirs = settings?.allowedProjectDirs ?? [];
  const [parent, setParent] = useState(dirs[0] ?? "");
  const [name, setName] = useState("");
  useEffect(() => {
    setName("");
    setParent(dirs[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);
  if (!template) return null;
  const sep = parent.includes("\\") ? "\\" : "/";

  async function create() {
    if (!template) return;
    const ok = await confirmAction({
      title: tr("Criar o projeto {name}?", { name: name.trim() }),
      description: tr("Cria a pasta abaixo com a estrutura do modelo e cadastra o projeto. Nada existente é alterado."),
      detail: `${parent}${sep}${name.trim()}\n\n${template.folders.map((f) => `📁 ${f}`).concat(template.files.map((f) => `📄 ${f.path}`)).join("\n")}`,
      confirmLabel: tr("Criar"),
    });
    if (!ok) return;
    const project = await attempt(window.workspace.templates.create({ pluginId: template.pluginId, templateId: template.id, parentDir: parent, name: name.trim() }, true), tr("Projeto criado"));
    if (project) {
      await reload();
      onClose();
      navigate("projetos", project.id);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("Novo projeto: {name}", { name: text(template.pluginId.startsWith("qyrex.") ? "builtin" : "local", template.name) })}
      description={text(template.pluginId.startsWith("qyrex.") ? "builtin" : "local", template.description)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr("Cancelar")}
          </Button>
          <Button onClick={() => void create()} disabled={!name.trim() || !parent}>
            <FolderPlus size={13} /> {tr("Criar projeto")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {dirs.length === 0 ? (
          <p className="text-sm text-warning">{tr("Autorize uma pasta de projetos em Configurações antes.")}</p>
        ) : (
          <Field label={tr("Criar dentro de")}>
            <select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
              {dirs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={tr("Nome do projeto (e da pasta)")}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-projeto" />
        </Field>
        <p className="text-[11px] text-text-faint">
          {[
            trn(template.folders.length, "{n} pasta", "{n} pastas"),
            trn(template.files.length, "{n} arquivo", "{n} arquivos"),
            trn(template.tasks.length, "{n} tarefa inicial", "{n} tarefas iniciais"),
          ].join(" · ")}
        </p>
      </div>
    </Dialog>
  );
}

/**
 * Plugins: liga/desliga os embutidos, instala pacotes locais (só manifesto JSON,
 * nunca código), mostra permissões e compatibilidade, e as configurações dos
 * plugins oficiais (links rápidos, modelos de projeto).
 */
export function PluginsPage() {
  const { plugins, loaded, load, setEnabled } = usePluginsStore();
  const [permissions, setPermissions] = useState<Record<PluginPermission, string> | null>(null);
  const [templates, setTemplates] = useState<(ProjectTemplate & { pluginId: string })[]>([]);
  const [chosen, setChosen] = useState<(ProjectTemplate & { pluginId: string }) | null>(null);

  const refresh = () => {
    void load();
    void attempt(window.workspace.templates.list()).then((t) => setTemplates(t ?? []));
  };
  useEffect(() => {
    refresh();
    void attempt(window.workspace.plugins.permissions()).then((p) => p && setPermissions(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function install() {
    const res = await attempt(window.workspace.plugins.install());
    if (!res) return;
    toast.success(res.updated ? tr("Plugin atualizado") : tr("Plugin instalado"));
    refresh();
  }
  async function uninstall(id: string, name: string) {
    const ok = await confirmAction({ title: tr("Remover o plugin {name}?", { name }), description: tr("Os links e modelos que ele trazia somem. Seus projetos e notas continuam."), danger: true, confirmLabel: tr("Remover") });
    if (!ok) return;
    if ((await attempt(window.workspace.plugins.uninstall(id, true), tr("Plugin removido"))) !== undefined) refresh();
  }

  const quickLinksOn = plugins.some((p) => p.manifest.id === "qyrex.quick-links" && p.enabled);

  return (
    <div>
      <PageHeader
        title={tr("Plugins")}
        icon={PAGE_ICONS.plugins}
        description={tr("Extensões declarativas: acrescentam links, modelos e painéis sem rodar código de terceiros.")}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void attempt(window.workspace.system.openExternalUrl(DOCS_URL))}>
              <BookOpen size={13} /> {tr("Criar um plugin")}
            </Button>
            <Button size="sm" onClick={() => void install()}>
              <PackagePlus size={13} /> {tr("Instalar pacote local")}
            </Button>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {!loaded && <p className="text-sm text-text-faint">{tr("Carregando...")}</p>}
        {plugins.map((p) => (
          <Card key={p.manifest.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-text">
                  {text(p.source, p.manifest.name)}
                  <span className="font-mono text-[11px] font-normal text-text-faint">v{p.manifest.version}</span>
                  {p.source === "builtin" ? <Badge tone="accent">{tr("Oficial")}</Badge> : <Badge>{tr("Local")}</Badge>}
                  {!p.compatible && <Badge tone="danger">{tr("Incompatível")}</Badge>}
                </p>
                <p className="text-[11px] text-text-faint">
                  {p.manifest.author} · <span className="font-mono">{p.manifest.id}</span>
                </p>
                {p.manifest.description && <p className="mt-1.5 text-xs text-text-muted">{text(p.source, p.manifest.description)}</p>}
              </div>
              <Switch checked={p.enabled} disabled={!p.compatible} onChange={(v) => void setEnabled(p.manifest.id, v).then(refresh)} />
            </div>
            {p.manifest.permissions.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border-subtle pt-2">
                {p.manifest.permissions.map((perm) => (
                  <li key={perm} className="flex items-start gap-1.5 text-[11.5px] text-text-muted">
                    <ShieldCheck size={12} className="mt-px shrink-0 text-success" />
                    {permissions ? tr(permissions[perm]) : perm}
                  </li>
                ))}
              </ul>
            )}
            {p.error && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
                <TriangleAlert size={12} className="mt-px shrink-0" /> {p.error}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2 text-[11px] text-text-faint">
              {tr("Pede o Qyrex {version}+", { version: p.manifest.qyrex })}
              {p.manifest.homepage && (
                <button className="inline-flex items-center gap-1 hover:text-text" onClick={() => void attempt(window.workspace.system.openExternalUrl(p.manifest.homepage!))}>
                  <ExternalLink size={10} /> {tr("Página")}
                </button>
              )}
              {p.source === "local" && (
                <Button size="xs" variant="ghost" className="ml-auto text-danger" onClick={() => void uninstall(p.manifest.id, p.manifest.name)}>
                  <Trash2 size={11} /> {tr("Remover")}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="section-title mb-2">{tr("Links rápidos")}</p>
          {quickLinksOn ? <QuickLinksManager /> : <p className="text-xs text-text-faint">{tr("Ligue o plugin Links rápidos para usar.")}</p>}
        </Card>
        <Card className="p-4">
          <p className="section-title mb-2">{tr("Modelos de projeto")}</p>
          {templates.length === 0 ? (
            <EmptyState icon={FolderPlus} title={tr("Nenhum modelo disponível")} description={tr("Ligue o plugin Modelos de projeto ou instale um plugin com modelos.")} className="py-4" />
          ) : (
            <ul className="space-y-1">
              {templates.map((t) => (
                <li key={`${t.pluginId}/${t.id}`} className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-bg-hover">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text">{text(t.pluginId.startsWith("qyrex.") ? "builtin" : "local", t.name)}</p>
                    <p className="truncate text-[11px] text-text-faint">{text(t.pluginId.startsWith("qyrex.") ? "builtin" : "local", t.description)}</p>
                  </div>
                  <Button size="xs" variant="secondary" onClick={() => setChosen(t)}>
                    <FolderPlus size={11} /> {tr("Usar")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <TemplateDialog template={chosen} onClose={() => setChosen(null)} />
    </div>
  );
}
