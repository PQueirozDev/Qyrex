import { randomUUID } from "node:crypto";
import { getDb } from "../database/db.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import type { Client } from "../../shared/types.js";

interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  monthly_value: number | null;
  next_billing_date: string | null;
  files_path: string | null;
  created_at: string;
}

function rowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    phone: row.phone,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    email: row.email,
    notes: row.notes,
    status: row.status as Client["status"],
    monthlyValue: row.monthly_value,
    nextBillingDate: row.next_billing_date,
    filesPath: row.files_path,
    createdAt: row.created_at,
  };
}

/** Escapa curingas do LIKE para que "%" ou "_" digitados sejam literais. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function listClients(search?: string): Client[] {
  const term = search?.trim();
  const rows = term
    ? (getDb()
        .prepare(
          `SELECT * FROM clients
           WHERE name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR instagram LIKE ? ESCAPE '\\'
              OR email LIKE ? ESCAPE '\\' OR whatsapp LIKE ? ESCAPE '\\'
           ORDER BY name COLLATE NOCASE ASC`
        )
        .all(...Array(5).fill(likePattern(term))) as ClientRow[])
    : (getDb().prepare("SELECT * FROM clients ORDER BY name COLLATE NOCASE ASC").all() as ClientRow[]);
  return rows.map(rowToClient);
}

export function getClient(id: string): Client | null {
  const row = getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id) as ClientRow | undefined;
  return row ? rowToClient(row) : null;
}

type ClientInput = Partial<Omit<Client, "id" | "createdAt">> & { name: string };

function validateFilesPath(filesPath: string | null | undefined): string | null {
  if (!filesPath) return null;
  return assertPathAllowedAndExists(filesPath);
}

export function createClient(input: ClientInput): Client {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO clients (id, name, company, phone, whatsapp, instagram, email, notes, status, monthly_value, next_billing_date, files_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.name,
      input.company ?? null,
      input.phone ?? null,
      input.whatsapp ?? null,
      input.instagram ?? null,
      input.email ?? null,
      input.notes ?? null,
      input.status ?? "ativo",
      input.monthlyValue ?? null,
      input.nextBillingDate ?? null,
      validateFilesPath(input.filesPath)
    );
  return getClient(id)!;
}

export function updateClient(id: string, partial: Partial<Omit<Client, "id" | "createdAt">>): Client {
  const current = getClient(id);
  if (!current) throw new Error("Cliente não encontrado.");
  const merged: Client = { ...current, ...partial };
  const filesPath = "filesPath" in partial ? validateFilesPath(partial.filesPath) : current.filesPath;

  getDb()
    .prepare(
      `UPDATE clients SET name = ?, company = ?, phone = ?, whatsapp = ?, instagram = ?, email = ?,
        notes = ?, status = ?, monthly_value = ?, next_billing_date = ?, files_path = ? WHERE id = ?`
    )
    .run(
      merged.name,
      merged.company,
      merged.phone,
      merged.whatsapp,
      merged.instagram,
      merged.email,
      merged.notes,
      merged.status,
      merged.monthlyValue,
      merged.nextBillingDate,
      filesPath,
      id
    );
  return getClient(id)!;
}

export function deleteClient(id: string): void {
  getDb().prepare("DELETE FROM clients WHERE id = ?").run(id);
}
