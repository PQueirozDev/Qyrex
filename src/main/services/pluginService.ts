import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dialog, type BrowserWindow } from "electron";
import { z } from "zod";
import { getDb } from "../database/db.js";
import { createLogger } from "../logger.js";
import { isProtocolAllowed } from "../security/commands.js";
import { assertPathAllowed, assertPathAllowedAndExists } from "../security/paths.js";
import { CHANGELOG, compareVersions } from "../../shared/changelog.js";
import { tm } from "../../shared/i18n.js";
import { tt } from "../i18n.js";
import { createProject } from "./projectService.js";
import { createTask } from "./taskService.js";
import type { PluginInfo, PluginManifest, PluginPermission, ProjectTemplate, QuickLink, Project } from "../../shared/types.js";

/**
 * Plugins do Qyrex: SÓ declarativos. Um plugin é um manifesto JSON
 * (`qyrex-plugin.json`) que declara o que acrescenta (links rápidos, modelos de
 * projeto) e as permissões para isso. Nenhum código de terceiro roda: o app lê os
 * dados, valida e usa com as próprias funções. Assim um plugin nunca alcança Node,
 * Electron, IPC, credenciais ou arquivos fora do que o usuário aprovar.
 *
 * Plugins embutidos (oficiais) vêm do código e podem ser desligados, não removidos.
 */

const log = createLogger("plugins");
const MANIFEST_FILE = "qyrex-plugin.json";
const MAX_MANIFEST_BYTES = 256_000;

export const PERMISSIONS: Record<PluginPermission, string> = {
  quickLinks: tm("Adicionar links rápidos (abrem no navegador)"),
  projectTemplates: tm("Oferecer modelos de projeto (pastas, arquivos de texto e tarefas, criados só com sua confirmação)"),
  notes: tm("Mostrar o painel de notas do projeto"),
};

// --- Validação do manifesto ----------------------------------------------------------

const safeRelPath = z
  .string()
  .min(1)
  .max(200)
  // eslint-disable-next-line no-control-regex -- caracteres de controle são proibidos em caminhos do Windows
  .refine((p) => !path.isAbsolute(p) && !p.split(/[\\/]/).some((part) => part === ".." || part === "") && !/[<>:"|?*\x00-\x1f]/.test(p), "Caminho inválido no modelo.");

const templateSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: z.string().min(1).max(60),
  description: z.string().max(240).default(""),
  technologies: z.array(z.string().max(30)).max(10).default([]),
  folders: z.array(safeRelPath).max(40).default([]),
  files: z.array(z.object({ path: safeRelPath, content: z.string().max(20_000) })).max(30).default([]),
  tasks: z.array(z.string().min(1).max(200)).max(30).default([]),
});

export const manifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/, "id do plugin inválido (use algo como autor.nome)"),
    name: z.string().min(1).max(60),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "versão inválida (use 1.0.0)"),
    author: z.string().min(1).max(80),
    description: z.string().max(400).default(""),
    homepage: z.string().url().max(300).optional(),
    /** Versão mínima do Qyrex. */
    qyrex: z.string().regex(/^\d+\.\d+\.\d+$/).default("2.2.0"),
    permissions: z.array(z.enum(["quickLinks", "projectTemplates", "notes"])).max(3).default([]),
    contributes: z
      .object({
        quickLinks: z.array(z.object({ title: z.string().min(1).max(60), url: z.string().url().max(500) })).max(30).optional(),
        projectTemplates: z.array(templateSchema).max(10).optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((m, ctx) => {
    // Toda contribuição precisa da permissão correspondente declarada.
    if (m.contributes.quickLinks?.length && !m.permissions.includes("quickLinks")) ctx.addIssue({ code: "custom", message: "quickLinks sem a permissão quickLinks" });
    if (m.contributes.projectTemplates?.length && !m.permissions.includes("projectTemplates")) ctx.addIssue({ code: "custom", message: "projectTemplates sem a permissão projectTemplates" });
    for (const l of m.contributes.quickLinks ?? []) {
      if (!/^https?:/i.test(l.url) || !isProtocolAllowed(l.url)) ctx.addIssue({ code: "custom", message: `link não permitido: ${l.url}` });
    }
  });

export function parseManifest(raw: string): PluginManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("O manifesto não é um JSON válido.");
  }
  const res = manifestSchema.safeParse(json);
  if (!res.success) throw new Error(`Manifesto inválido: ${res.error.issues.map((i) => `${i.path.join(".") || "manifesto"}: ${i.message}`).join("; ")}`);
  return res.data as PluginManifest;
}

// --- Plugins embutidos ---------------------------------------------------------------

const BUILTIN: PluginManifest[] = [
  {
    id: "qyrex.project-notes",
    name: tm("Notas do projeto"),
    version: "1.0.0",
    author: "Qyrex",
    description: tm("Um painel de notas em Markdown por projeto, no Workspace. As notas ficam no banco local."),
    qyrex: "2.2.0",
    permissions: ["notes"],
    contributes: {},
  },
  {
    id: "qyrex.quick-links",
    name: tm("Links rápidos"),
    version: "1.0.0",
    author: "Qyrex",
    description: tm("Seus atalhos (documentação, painel de deploy, board) na paleta de comandos, gerais ou por projeto."),
    qyrex: "2.2.0",
    permissions: ["quickLinks"],
    contributes: {},
  },
  {
    id: "qyrex.project-templates",
    name: tm("Modelos de projeto"),
    version: "1.0.0",
    author: "Qyrex",
    description: tm("Cria a estrutura de um projeto novo (pastas, README, tarefas iniciais) a partir de um modelo."),
    qyrex: "2.2.0",
    permissions: ["projectTemplates"],
    contributes: {
      projectTemplates: [
        {
          id: "api-node",
          name: tm("API Node.js"),
          description: tm("API com pastas de rotas, serviços e testes."),
          technologies: ["Node.js", "TypeScript"],
          folders: ["src/routes", "src/services", "tests"],
          files: [
            { path: "README.md", content: "# {name}\n\nAPI em Node.js.\n\n## Rodar\n\n```bash\nnpm install\nnpm run dev\n```\n" },
            { path: ".gitignore", content: "node_modules/\ndist/\n.env\n" },
            { path: ".env.example", content: "PORT=3000\nDATABASE_URL=\n" },
          ],
          tasks: [tm("Definir as rotas principais"), tm("Configurar o banco de dados"), tm("Escrever os primeiros testes")],
        },
        {
          id: "web-app",
          name: tm("Aplicação web"),
          description: tm("Front-end com componentes, páginas e assets."),
          technologies: ["TypeScript"],
          folders: ["src/components", "src/pages", "public"],
          files: [
            { path: "README.md", content: "# {name}\n\nAplicação web.\n" },
            { path: ".gitignore", content: "node_modules/\ndist/\n.env\n" },
          ],
          tasks: [tm("Montar o layout base"), tm("Criar a primeira página"), tm("Configurar o deploy")],
        },
        {
          id: "estudo",
          name: tm("Projeto de estudo"),
          description: tm("Pasta de anotações e exercícios, com um roteiro de tarefas."),
          technologies: [],
          folders: ["anotacoes", "exercicios"],
          files: [{ path: "README.md", content: "# {name}\n\nO que estou estudando e por quê.\n" }],
          tasks: [tm("Definir o objetivo do estudo"), tm("Separar o material")],
        },
      ],
    },
  },
];

// --- Estado ----------------------------------------------------------------------------

interface Row {
  id: string;
  source: "builtin" | "local";
  enabled: number;
  manifest: string | null;
  installed_at: string;
}

function rows(): Row[] {
  return getDb().prepare("SELECT id, source, enabled, manifest, installed_at FROM plugins").all() as Row[];
}

function compatible(m: PluginManifest): boolean {
  // A primeira entrada do changelog é a versão do app (um teste garante que bate com o package.json).
  return compareVersions(CHANGELOG[0].version, m.qyrex) >= 0;
}

export function listPlugins(): PluginInfo[] {
  const stored = new Map(rows().map((r) => [r.id, r]));
  const builtins: PluginInfo[] = BUILTIN.map((m) => ({
    manifest: m,
    source: "builtin",
    // Embutidos começam ligados (sem linha no banco = ligado).
    enabled: stored.get(m.id) ? stored.get(m.id)!.enabled === 1 : true,
    compatible: true,
    error: null,
    installedAt: null,
  }));
  const locals: PluginInfo[] = [...stored.values()]
    .filter((r) => r.source === "local")
    .map((r) => {
      try {
        const m = parseManifest(r.manifest ?? "");
        const ok = compatible(m);
        return { manifest: m, source: "local", enabled: r.enabled === 1 && ok, compatible: ok, error: ok ? null : tm("Precisa de uma versão mais nova do Qyrex."), installedAt: r.installed_at };
      } catch (err) {
        const fallback: PluginManifest = { id: r.id, name: r.id, version: "0.0.0", author: "?", description: "", qyrex: "0.0.0", permissions: [], contributes: {} };
        return { manifest: fallback, source: "local", enabled: false, compatible: false, error: err instanceof Error ? err.message : String(err), installedAt: r.installed_at };
      }
    });
  return [...builtins, ...locals];
}

const enabledPlugins = () => listPlugins().filter((p) => p.enabled);

export function isPermissionActive(permission: PluginPermission): boolean {
  return enabledPlugins().some((p) => p.manifest.permissions.includes(permission));
}

export function setEnabled(id: string, enabled: boolean): PluginInfo[] {
  const plugin = listPlugins().find((p) => p.manifest.id === id);
  if (!plugin) throw new Error("Plugin não encontrado.");
  if (enabled && !plugin.compatible) throw new Error("Este plugin não é compatível com esta versão do Qyrex.");
  getDb()
    .prepare(
      `INSERT INTO plugins (id, source, enabled) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .run(id, plugin.source, enabled ? 1 : 0);
  return listPlugins();
}

/** Lê o manifesto de uma pasta (ou do próprio arquivo .json) escolhida no seletor nativo. */
function readManifestFrom(target: string): string {
  const stat = fs.statSync(target);
  const file = stat.isDirectory() ? path.join(target, MANIFEST_FILE) : target;
  const fstat = fs.lstatSync(file);
  if (!fstat.isFile()) throw new Error(`Não encontrei ${MANIFEST_FILE} nessa pasta.`);
  if (fstat.size > MAX_MANIFEST_BYTES) throw new Error("Manifesto grande demais.");
  return fs.readFileSync(file, "utf-8");
}

/** Instala (ou atualiza) um pacote local escolhido pelo usuário. Devolve null se ele cancelar. */
export async function installFromDialog(win: BrowserWindow | null): Promise<{ plugin: PluginInfo; updated: boolean } | null> {
  const options: Electron.OpenDialogOptions = {
    title: "Qyrex — instalar plugin",
    properties: ["openFile", "openDirectory"],
    filters: [{ name: "Plugin do Qyrex", extensions: ["json"] }],
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  return installManifest(readManifestFrom(result.filePaths[0]));
}

export function installManifest(raw: string): { plugin: PluginInfo; updated: boolean } {
  const m = parseManifest(raw);
  if (BUILTIN.some((b) => b.id === m.id)) throw new Error("Esse id é de um plugin embutido do Qyrex.");
  if (!compatible(m)) throw new Error(`Este plugin pede o Qyrex ${m.qyrex} ou mais novo.`);
  const existing = rows().find((r) => r.id === m.id);
  if (existing?.manifest) {
    const current = parseManifest(existing.manifest);
    if (compareVersions(m.version, current.version) < 0) throw new Error(`Já está instalada a versão ${current.version}, mais nova que ${m.version}.`);
  }
  getDb()
    .prepare(
      `INSERT INTO plugins (id, source, enabled, manifest) VALUES (?, 'local', 1, ?)
       ON CONFLICT(id) DO UPDATE SET manifest = excluded.manifest, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .run(m.id, JSON.stringify(m));
  log.info(`plugin ${existing ? "atualizado" : "instalado"}: ${m.id}@${m.version}`);
  return { plugin: listPlugins().find((p) => p.manifest.id === m.id)!, updated: Boolean(existing) };
}

export function uninstall(id: string): void {
  if (BUILTIN.some((b) => b.id === id)) throw new Error("Plugins embutidos podem ser desligados, não removidos.");
  getDb().prepare("DELETE FROM plugins WHERE id = ? AND source = 'local'").run(id);
}

// --- Links rápidos -------------------------------------------------------------------

export function listQuickLinks(projectId?: string | null): QuickLink[] {
  if (!isPermissionActive("quickLinks")) return [];
  const own = (
    getDb()
      .prepare("SELECT id, project_id, title, url FROM quick_links WHERE project_id IS NULL OR project_id = ? ORDER BY position, created_at")
      .all(projectId ?? null) as { id: string; project_id: string | null; title: string; url: string }[]
  ).map((r) => ({ id: r.id, projectId: r.project_id, title: r.title, url: r.url, pluginId: null }));
  const fromPlugins = enabledPlugins()
    .filter((p) => p.manifest.permissions.includes("quickLinks"))
    .flatMap((p) => (p.manifest.contributes.quickLinks ?? []).map((l, i) => ({ id: `${p.manifest.id}#${i}`, projectId: null, title: l.title, url: l.url, pluginId: p.manifest.id })));
  return [...own, ...fromPlugins];
}

export function addQuickLink(input: { title: string; url: string; projectId?: string | null }): QuickLink {
  if (!/^https?:/i.test(input.url) || !isProtocolAllowed(input.url)) throw new Error("Use um link http ou https.");
  const id = randomUUID();
  getDb().prepare("INSERT INTO quick_links (id, project_id, title, url) VALUES (?, ?, ?, ?)").run(id, input.projectId ?? null, input.title, input.url);
  return { id, projectId: input.projectId ?? null, title: input.title, url: input.url, pluginId: null };
}

export function removeQuickLink(id: string): void {
  getDb().prepare("DELETE FROM quick_links WHERE id = ?").run(id);
}

// --- Modelos de projeto --------------------------------------------------------------

export function listTemplates(): (ProjectTemplate & { pluginId: string })[] {
  return enabledPlugins()
    .filter((p) => p.manifest.permissions.includes("projectTemplates"))
    .flatMap((p) => (p.manifest.contributes.projectTemplates ?? []).map((t) => ({ ...t, pluginId: p.manifest.id })));
}

/**
 * Cria um projeto a partir de um modelo (depois da confirmação na UI): pasta nova
 * dentro de um diretório autorizado, as pastas e arquivos de texto do modelo, o
 * cadastro do projeto e as tarefas iniciais. Nunca sobrescreve nada: a pasta de
 * destino não pode existir.
 */
export function createFromTemplate(input: { pluginId: string; templateId: string; parentDir: string; name: string }): Project {
  const template = listTemplates().find((t) => t.pluginId === input.pluginId && t.id === input.templateId);
  if (!template) throw new Error("Modelo não encontrado (o plugin pode estar desligado).");
  // eslint-disable-next-line no-control-regex -- caracteres de controle são proibidos em nomes de pasta no Windows
  const folderName = input.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\.+$/, "");
  if (!folderName) throw new Error("Nome de pasta inválido.");
  const parent = assertPathAllowedAndExists(input.parentDir);
  const root = assertPathAllowed(path.join(parent, folderName));
  if (fs.existsSync(root)) throw new Error("Já existe uma pasta com esse nome. Escolha outro.");

  fs.mkdirSync(root);
  const inside = (rel: string) => {
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) throw new Error("Caminho inválido no modelo.");
    return full;
  };
  for (const dir of template.folders) fs.mkdirSync(inside(dir), { recursive: true });
  for (const file of template.files) {
    const full = inside(file.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content.replaceAll("{name}", input.name.trim()), { flag: "wx" });
  }
  const project = createProject({
    name: input.name.trim(),
    localPath: root,
    technologies: template.technologies,
    description: template.description ? (input.pluginId.startsWith("qyrex.") ? tt(template.description) : template.description) : undefined,
  });
  // Textos dos modelos embutidos são traduzidos no idioma atual; os de terceiros vão como estão.
  const text = (t: string) => (input.pluginId.startsWith("qyrex.") ? tt(t) : t);
  for (const title of template.tasks) createTask({ title: text(title), projectId: project.id });
  log.info(`projeto criado pelo modelo ${input.pluginId}/${template.id}`);
  return project;
}
