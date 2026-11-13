import { getDb } from "../database/db.js";
import { getProject } from "./projectService.js";
import type { ProjectNote } from "../../shared/types.js";

/** Notas em Markdown por projeto (Workspace → painel Notas). Só texto do usuário, no banco local. */

export const MAX_NOTE_CHARS = 200_000;

export function getNote(projectId: string): ProjectNote {
  if (!getProject(projectId)) throw new Error("Projeto não encontrado.");
  const row = getDb().prepare("SELECT content, updated_at FROM project_notes WHERE project_id = ?").get(projectId) as
    | { content: string; updated_at: string }
    | undefined;
  return { projectId, content: row?.content ?? "", updatedAt: row?.updated_at ?? null };
}

export function saveNote(projectId: string, content: string): ProjectNote {
  if (!getProject(projectId)) throw new Error("Projeto não encontrado.");
  if (content.length > MAX_NOTE_CHARS) throw new Error("A nota passou do limite de 200 mil caracteres.");
  getDb()
    .prepare(
      `INSERT INTO project_notes (project_id, content, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
    )
    .run(projectId, content);
  return getNote(projectId);
}
