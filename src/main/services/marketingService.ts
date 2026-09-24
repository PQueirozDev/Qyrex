import { randomUUID } from "node:crypto";
import { getDb } from "../database/db.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import type { MarketingContent } from "../../shared/types.js";

interface MarketingRow {
  id: string;
  client_id: string | null;
  type: string;
  title: string;
  description: string | null;
  caption: string | null;
  status: string;
  scheduled_date: string | null;
  files: string;
  created_at: string;
}

function rowToContent(row: MarketingRow): MarketingContent {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type as MarketingContent["type"],
    title: row.title,
    description: row.description,
    caption: row.caption,
    status: row.status as MarketingContent["status"],
    scheduledDate: row.scheduled_date,
    files: JSON.parse(row.files) as string[],
    createdAt: row.created_at,
  };
}

const ORDER = "ORDER BY scheduled_date IS NULL, scheduled_date ASC, created_at DESC";

export function listMarketingContent(filter?: { clientId?: string; from?: string; to?: string }): MarketingContent[] {
  const where: string[] = [];
  const params: string[] = [];
  if (filter?.clientId) {
    where.push("client_id = ?");
    params.push(filter.clientId);
  }
  if (filter?.from) {
    where.push("scheduled_date >= ?");
    params.push(filter.from);
  }
  if (filter?.to) {
    where.push("scheduled_date <= ?");
    params.push(filter.to);
  }
  const sql = `SELECT * FROM marketing_content ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ${ORDER}`;
  return (getDb().prepare(sql).all(...params) as MarketingRow[]).map(rowToContent);
}

function getContent(id: string): MarketingContent | null {
  const row = getDb().prepare("SELECT * FROM marketing_content WHERE id = ?").get(id) as MarketingRow | undefined;
  return row ? rowToContent(row) : null;
}

function validateFiles(files: string[] | undefined): string[] {
  return (files ?? []).map((f) => assertPathAllowedAndExists(f));
}

export function createMarketingContent(input: {
  title: string;
  type: MarketingContent["type"];
  clientId?: string;
  description?: string;
  caption?: string;
  status?: MarketingContent["status"];
  scheduledDate?: string;
  files?: string[];
}): MarketingContent {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO marketing_content (id, client_id, type, title, description, caption, status, scheduled_date, files)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.clientId ?? null,
      input.type,
      input.title,
      input.description ?? null,
      input.caption ?? null,
      input.status ?? "ideia",
      input.scheduledDate ?? null,
      JSON.stringify(validateFiles(input.files))
    );
  return getContent(id)!;
}

export function updateMarketingContent(
  id: string,
  partial: Partial<Omit<MarketingContent, "id" | "createdAt">>
): MarketingContent {
  const current = getContent(id);
  if (!current) throw new Error("Conteúdo não encontrado.");
  const merged = { ...current, ...partial };
  const files = partial.files ? validateFiles(partial.files) : current.files;

  getDb()
    .prepare(
      `UPDATE marketing_content SET title = ?, type = ?, description = ?, caption = ?, status = ?,
         scheduled_date = ?, client_id = ?, files = ? WHERE id = ?`
    )
    .run(
      merged.title,
      merged.type,
      merged.description,
      merged.caption,
      merged.status,
      merged.scheduledDate,
      merged.clientId,
      JSON.stringify(files),
      id
    );
  return getContent(id)!;
}

export function deleteMarketingContent(id: string): void {
  getDb().prepare("DELETE FROM marketing_content WHERE id = ?").run(id);
}
