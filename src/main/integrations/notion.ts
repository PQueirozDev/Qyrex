import { deleteSecret, getSecret, maskKey, saveSecret } from "../security/secrets.js";
import { setIntegrationState } from "../services/integrationsService.js";
import { createLogger } from "../logger.js";
import { endpoints } from "./endpoints.js";
import type { NotionItem, NotionPageContent } from "../../shared/types.js";

const log = createLogger("notion");

/**
 * Integração com o Notion por token de "integração interna"
 * (notion.so/my-integrations). O Notion só deixa a integração ver as páginas
 * que o usuário compartilhou com ela ("Conexões" em cada página). O token fica
 * no cofre do sistema; o app só lê, busca e cria páginas quando o usuário pede.
 */

const NOTION_VERSION = "2022-06-28";
const MAX_BLOCKS = 400;

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}

async function notion<T>(path: string, init: RequestInit = {}, token = getSecret("notion")): Promise<T> {
  if (!token) throw new Error("Notion não conectado. Conecte em Integrações.");
  const res = await fetch(`${endpoints.notion()}${path}`, { ...init, headers: headers(token) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    if (res.status === 401) throw new Error("Notion: token inválido ou revogado.");
    if (res.status === 404 || body.code === "object_not_found") {
      throw new Error("Notion: página não encontrada. Compartilhe a página com a integração (menu ••• → Conexões).");
    }
    if (res.status === 429) throw new Error("Notion: muitas requisições. Tente de novo em instantes.");
    throw new Error(`Notion (${res.status}): ${body.message ?? res.statusText}`);
  }
  return (await res.json()) as T;
}

// --- Tipos crus da API (só o que usamos) -------------------------------------------

interface RichText {
  plain_text: string;
  href?: string | null;
  annotations?: { bold?: boolean; italic?: boolean; code?: boolean; strikethrough?: boolean };
}
interface RawIcon {
  type?: string;
  emoji?: string;
}
interface RawObject {
  object: "page" | "database";
  id: string;
  url: string;
  last_edited_time: string;
  icon?: RawIcon | null;
  title?: RichText[];
  properties?: Record<string, { type: string; title?: RichText[] }>;
  parent?: { type: string };
}
interface RawBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

// --- Conversões ----------------------------------------------------------------------

const plain = (rich: RichText[] | undefined) => (rich ?? []).map((r) => r.plain_text).join("");

/** Rich text do Notion em Markdown (negrito, itálico, código, links). */
export function richToMarkdown(rich: RichText[] | undefined): string {
  return (rich ?? [])
    .map((r) => {
      let t = r.plain_text;
      if (!t) return "";
      const a = r.annotations ?? {};
      if (a.code) t = `\`${t}\``;
      if (a.bold) t = `**${t}**`;
      if (a.italic) t = `*${t}*`;
      if (a.strikethrough) t = `~~${t}~~`;
      if (r.href && /^https?:\/\//.test(r.href)) t = `[${t}](${r.href})`;
      return t;
    })
    .join("");
}

export function titleOf(obj: RawObject): string {
  if (obj.object === "database") return plain(obj.title).trim() || "Sem título";
  const prop = Object.values(obj.properties ?? {}).find((p) => p.type === "title");
  return plain(prop?.title).trim() || "Sem título";
}

const iconOf = (icon: RawIcon | null | undefined) => (icon?.type === "emoji" && icon.emoji ? icon.emoji : null);

export function toItem(obj: RawObject): NotionItem {
  return { id: obj.id, type: obj.object, title: titleOf(obj), icon: iconOf(obj.icon), url: obj.url, lastEditedAt: obj.last_edited_time };
}

/** Um bloco do Notion em Markdown (tipos mais comuns; o resto vira texto simples). */
export function blockToMarkdown(block: RawBlock, depth = 0): string {
  const data = (block[block.type] ?? {}) as { rich_text?: RichText[]; checked?: boolean; language?: string; icon?: RawIcon };
  const text = richToMarkdown(data.rich_text);
  const indent = "  ".repeat(depth);
  switch (block.type) {
    case "paragraph":
      return `${indent}${text}`;
    case "heading_1":
      return `# ${text}`;
    case "heading_2":
      return `## ${text}`;
    case "heading_3":
      return `### ${text}`;
    case "bulleted_list_item":
      return `${indent}- ${text}`;
    case "numbered_list_item":
      return `${indent}1. ${text}`;
    case "to_do":
      return `${indent}- [${data.checked ? "x" : " "}] ${text}`;
    case "toggle":
      return `${indent}- ${text}`;
    case "quote":
      return `> ${text}`;
    case "callout":
      return `> ${iconOf(data.icon) ?? "💡"} ${text}`;
    case "code":
      return `\`\`\`${data.language && data.language !== "plain text" ? data.language : ""}\n${plain(data.rich_text)}\n\`\`\``;
    case "divider":
      return "---";
    case "child_page":
      return `📄 **${(block.child_page as { title?: string })?.title ?? "Subpágina"}**`;
    case "child_database":
      return `🗂️ **${(block.child_database as { title?: string })?.title ?? "Banco de dados"}**`;
    case "image":
      return "🖼️ *(imagem)*";
    case "bookmark":
    case "link_preview": {
      const url = (block[block.type] as { url?: string })?.url;
      return url && /^https?:\/\//.test(url) ? `🔗 ${url}` : "";
    }
    default:
      return text ? `${indent}${text}` : "";
  }
}

// --- Conexão ---------------------------------------------------------------------------

export async function connect(token: string): Promise<{ workspace: string }> {
  const t = token.trim();
  const me = await notion<{ name?: string; bot?: { workspace_name?: string | null } }>("/users/me", {}, t);
  saveSecret("notion", t);
  const workspace = me.bot?.workspace_name || me.name || "Notion";
  setIntegrationState("notion", "connected", { workspace, maskedKey: maskKey(t), lastError: undefined });
  log.info("Notion conectado");
  return { workspace };
}

export function disconnect(): void {
  deleteSecret("notion");
  setIntegrationState("notion", "disconnected", {}, false);
}

export async function test(): Promise<{ ok: boolean; error?: string }> {
  try {
    await notion("/users/me");
    setIntegrationState("notion", "connected", { lastError: undefined });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setIntegrationState("notion", "error", { lastError: message });
    return { ok: false, error: message };
  }
}

// --- Leitura -----------------------------------------------------------------------------

/** Busca páginas e bancos compartilhados com a integração (mais recentes primeiro). */
export async function search(query: string, kind?: "page" | "database"): Promise<NotionItem[]> {
  const body: Record<string, unknown> = { page_size: 30, sort: { direction: "descending", timestamp: "last_edited_time" } };
  if (query.trim()) body.query = query.trim();
  if (kind) body.filter = { property: "object", value: kind };
  const res = await notion<{ results: RawObject[] }>("/search", { method: "POST", body: JSON.stringify(body) });
  return res.results.filter((r) => r.object === "page" || r.object === "database").map(toItem);
}

async function children(blockId: string, budget: { left: number }): Promise<RawBlock[]> {
  const out: RawBlock[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
    const res = await notion<{ results: RawBlock[]; has_more: boolean; next_cursor: string | null }>(`/blocks/${blockId}/children?${qs.toString()}`);
    out.push(...res.results);
    budget.left -= res.results.length;
    cursor = res.has_more && budget.left > 0 ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return out;
}

/** Conteúdo de uma página em Markdown (até ~400 blocos, com um nível de sub-itens). */
export async function page(id: string): Promise<NotionPageContent> {
  const meta = await notion<RawObject>(`/pages/${id}`);
  const budget = { left: MAX_BLOCKS };
  const top = await children(id, budget);
  const lines: string[] = [];
  for (const block of top) {
    lines.push(blockToMarkdown(block));
    // Sub-itens de listas e toggles (um nível), enquanto houver orçamento.
    if (block.has_children && budget.left > 0 && !["child_page", "child_database"].includes(block.type)) {
      for (const child of await children(block.id, budget)) lines.push(blockToMarkdown(child, 1));
    }
  }
  return {
    id: meta.id,
    title: titleOf(meta),
    icon: iconOf(meta.icon),
    url: meta.url,
    lastEditedAt: meta.last_edited_time,
    markdown: lines.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n\n").replace(/\n{3,}/g, "\n\n").trim(),
    truncated: budget.left <= 0,
  };
}

// --- Escrita -------------------------------------------------------------------------------

const rich = (content: string) => {
  // O Notion aceita até 2000 caracteres por trecho de texto.
  const parts: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < content.length; i += 2000) parts.push({ type: "text", text: { content: content.slice(i, i + 2000) } });
  return parts;
};

/** Texto simples/Markdown leve em blocos do Notion (títulos, listas, tarefas e parágrafos). */
export function textToBlocks(content: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    let type = "paragraph";
    let text = line;
    let extra: Record<string, unknown> = {};
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      type = `heading_${m[1].length}`;
      text = m[2];
    } else if (/^\s*[-*]\s+\[( |x)\]\s+/i.test(line)) {
      type = "to_do";
      extra = { checked: /\[x\]/i.test(line) };
      text = line.replace(/^\s*[-*]\s+\[( |x)\]\s+/i, "");
    } else if (/^\s*[-*]\s+/.test(line)) {
      type = "bulleted_list_item";
      text = line.replace(/^\s*[-*]\s+/, "");
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      type = "numbered_list_item";
      text = line.replace(/^\s*\d+[.)]\s+/, "");
    } else if (/^>\s?/.test(line)) {
      type = "quote";
      text = line.replace(/^>\s?/, "");
    }
    blocks.push({ object: "block", type, [type]: { rich_text: rich(text), ...extra } });
    if (blocks.length >= 100) break; // limite do Notion por requisição
  }
  return blocks;
}

/** Cria uma página dentro de uma página ou de um banco de dados compartilhado com a integração. */
export async function createPage(input: { parentId: string; parentType: "page" | "database"; title: string; content?: string }): Promise<NotionItem> {
  let properties: Record<string, unknown>;
  if (input.parentType === "database") {
    // Em bancos, o título vai na propriedade do tipo "title" (o nome varia: "Nome", "Name", "Tarefa"...).
    const db = await notion<{ properties: Record<string, { type: string }> }>(`/databases/${input.parentId}`);
    const titleProp = Object.entries(db.properties).find(([, p]) => p.type === "title")?.[0] ?? "Name";
    properties = { [titleProp]: { title: rich(input.title) } };
  } else {
    properties = { title: { title: rich(input.title) } };
  }
  const created = await notion<RawObject>("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: input.parentType === "database" ? { database_id: input.parentId } : { page_id: input.parentId },
      properties,
      children: textToBlocks(input.content ?? ""),
    }),
  });
  log.info("Página criada no Notion");
  return toItem(created);
}
