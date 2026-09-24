import { randomUUID } from "node:crypto";
import { getDb } from "../database/db.js";
import type { RecentItem, RecentItemType } from "../../shared/types.js";

interface RecentRow {
  id: string;
  item_type: string;
  item_id: string;
  label: string;
  opened_at: string;
}

const MAX_ITEMS = 300;

/** Registra uma atividade (projeto aberto, tarefa concluída...) para o feed do Dashboard. */
export function recordActivity(itemType: RecentItemType, itemId: string, label: string): void {
  const db = getDb();
  db.transaction(() => {
    // Para "abrir" algo, mantém só a ocorrência mais recente de cada item.
    if (itemType === "project" || itemType === "file" || itemType === "client") {
      db.prepare("DELETE FROM recent_items WHERE item_type = ? AND item_id = ?").run(itemType, itemId);
    }
    db.prepare(
      "INSERT INTO recent_items (id, item_type, item_id, label, opened_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))"
    ).run(randomUUID(), itemType, itemId, label);
    db.prepare(
      `DELETE FROM recent_items WHERE id NOT IN (SELECT id FROM recent_items ORDER BY opened_at DESC LIMIT ${MAX_ITEMS})`
    ).run();
  })();
}

export function listActivity(limit = 20, itemType?: RecentItemType): RecentItem[] {
  const rows = itemType
    ? (getDb()
        .prepare("SELECT * FROM recent_items WHERE item_type = ? ORDER BY opened_at DESC LIMIT ?")
        .all(itemType, limit) as RecentRow[])
    : (getDb().prepare("SELECT * FROM recent_items ORDER BY opened_at DESC LIMIT ?").all(limit) as RecentRow[]);
  return rows.map((r) => ({
    id: r.id,
    itemType: r.item_type as RecentItemType,
    itemId: r.item_id,
    label: r.label,
    openedAt: r.opened_at,
  }));
}
