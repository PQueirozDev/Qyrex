import { randomUUID } from "node:crypto";
import { getDb } from "../database/db.js";
import type { CalendarEvent } from "../../shared/types.js";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  source: string;
  external_id: string | null;
  created_at: string;
}

function rowToEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    source: row.source as CalendarEvent["source"],
    externalId: row.external_id,
    createdAt: row.created_at,
  };
}

/**
 * Datas são gravadas como "AAAA-MM-DDTHH:MM:SS" no horário LOCAL (sem fuso),
 * o que mantém a comparação por string correta e evita que um evento às 22h
 * "pule" para o dia seguinte ao converter para UTC.
 */
export function listEvents(range?: { from: string; to: string }): CalendarEvent[] {
  const rows = range
    ? (getDb()
        .prepare(
          `SELECT * FROM calendar_events
           WHERE starts_at <= ? AND COALESCE(ends_at, starts_at) >= ?
           ORDER BY starts_at ASC`
        )
        .all(range.to, range.from) as EventRow[])
    : (getDb().prepare("SELECT * FROM calendar_events ORDER BY starts_at ASC").all() as EventRow[]);
  return rows.map(rowToEvent);
}

function getEvent(id: string): CalendarEvent | null {
  const row = getDb().prepare("SELECT * FROM calendar_events WHERE id = ?").get(id) as EventRow | undefined;
  return row ? rowToEvent(row) : null;
}

function assertRange(startsAt: string, endsAt: string | null | undefined): void {
  if (endsAt && endsAt < startsAt) throw new Error("O término precisa ser depois do início.");
}

export function createEvent(input: {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
}): CalendarEvent {
  assertRange(input.startsAt, input.endsAt);
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO calendar_events (id, title, description, starts_at, ends_at, location, source)
       VALUES (?, ?, ?, ?, ?, ?, 'local')`
    )
    .run(id, input.title, input.description ?? null, input.startsAt, input.endsAt ?? null, input.location ?? null);
  return getEvent(id)!;
}

function assertLocal(event: CalendarEvent): void {
  // Eventos importados do Google (source = 'google') são somente leitura aqui:
  // a sincronização é unidirecional (Google → Workspace) e editar localmente
  // geraria divergência na próxima sincronização.
  if (event.source === "google") throw new Error("Este evento vem do Google Calendar; edite-o por lá.");
}

export function updateEvent(
  id: string,
  partial: Partial<Pick<CalendarEvent, "title" | "description" | "startsAt" | "endsAt" | "location">>
): CalendarEvent {
  const current = getEvent(id);
  if (!current) throw new Error("Evento não encontrado.");
  assertLocal(current);
  const merged = { ...current, ...partial };
  assertRange(merged.startsAt, merged.endsAt);
  getDb()
    .prepare("UPDATE calendar_events SET title = ?, description = ?, starts_at = ?, ends_at = ?, location = ? WHERE id = ?")
    .run(merged.title, merged.description, merged.startsAt, merged.endsAt, merged.location, id);
  return getEvent(id)!;
}

export function deleteEvent(id: string): void {
  const current = getEvent(id);
  if (!current) return;
  assertLocal(current);
  getDb().prepare("DELETE FROM calendar_events WHERE id = ?").run(id);
}

/** Substitui os eventos do Google numa janela de tempo pelos recém-sincronizados. */
export function replaceGoogleEvents(
  window: { from: string; to: string },
  events: { externalId: string; title: string; description: string | null; startsAt: string; endsAt: string | null; location: string | null }[]
): number {
  const db = getDb();
  const apply = db.transaction(() => {
    db.prepare("DELETE FROM calendar_events WHERE source = 'google' AND starts_at >= ? AND starts_at <= ?").run(
      window.from,
      window.to
    );
    const insert = db.prepare(
      `INSERT INTO calendar_events (id, title, description, starts_at, ends_at, location, source, external_id)
       VALUES (?, ?, ?, ?, ?, ?, 'google', ?)`
    );
    const exists = db.prepare("SELECT id FROM calendar_events WHERE source = 'google' AND external_id = ?");
    const update = db.prepare(
      "UPDATE calendar_events SET title = ?, description = ?, starts_at = ?, ends_at = ?, location = ? WHERE id = ?"
    );
    for (const ev of events) {
      const row = exists.get(ev.externalId) as { id: string } | undefined;
      if (row) update.run(ev.title, ev.description, ev.startsAt, ev.endsAt, ev.location, row.id);
      else insert.run(randomUUID(), ev.title, ev.description, ev.startsAt, ev.endsAt, ev.location, ev.externalId);
    }
  });
  apply();
  return events.length;
}

export function removeAllGoogleEvents(): void {
  getDb().prepare("DELETE FROM calendar_events WHERE source = 'google'").run();
}
