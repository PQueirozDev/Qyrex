import { randomUUID } from "node:crypto";
import { getDb } from "../database/db.js";
import type { SavedPrompt } from "../../shared/types.js";

/** Prompts salvos pelo usuário. Inserir um prompt só preenche o campo de mensagem: enviar é sempre um clique. */

interface PromptRow {
  id: string;
  title: string;
  content: string;
  used_count: number;
  created_at: string;
  updated_at: string;
}

const toPrompt = (r: PromptRow): SavedPrompt => ({ id: r.id, title: r.title, content: r.content, usedCount: r.used_count, createdAt: r.created_at, updatedAt: r.updated_at });

/** Os mais usados primeiro. */
export function listPrompts(): SavedPrompt[] {
  return (getDb().prepare("SELECT * FROM ai_prompts ORDER BY used_count DESC, title COLLATE NOCASE").all() as PromptRow[]).map(toPrompt);
}

function getPrompt(id: string): SavedPrompt {
  const row = getDb().prepare("SELECT * FROM ai_prompts WHERE id = ?").get(id) as PromptRow | undefined;
  if (!row) throw new Error("Prompt não encontrado.");
  return toPrompt(row);
}

export function createPrompt(input: { title: string; content: string }): SavedPrompt {
  const id = randomUUID();
  getDb().prepare("INSERT INTO ai_prompts (id, title, content) VALUES (?, ?, ?)").run(id, input.title, input.content);
  return getPrompt(id);
}

export function updatePrompt(id: string, patch: Partial<{ title: string; content: string }>): SavedPrompt {
  const current = getPrompt(id);
  getDb()
    .prepare("UPDATE ai_prompts SET title = ?, content = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(patch.title ?? current.title, patch.content ?? current.content, id);
  return getPrompt(id);
}

export function deletePrompt(id: string): void {
  getDb().prepare("DELETE FROM ai_prompts WHERE id = ?").run(id);
}

export function markPromptUsed(id: string): void {
  getDb().prepare("UPDATE ai_prompts SET used_count = used_count + 1 WHERE id = ?").run(id);
}
