import { randomUUID } from "node:crypto";
import { getDb } from "../database/db.js";
import { recordActivity } from "./recentService.js";
import type { Task, TaskPriority, TaskStatus } from "../../shared/types.js";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  project_id: string | null;
  client_id: string | null;
  due_date: string | null;
  due_time: string | null;
  tags: string;
  created_at: string;
  completed_at: string | null;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    projectId: row.project_id,
    clientId: row.client_id,
    dueDate: row.due_date,
    dueTime: row.due_time,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

const ORDER = `ORDER BY
  CASE status WHEN 'concluido' THEN 1 ELSE 0 END,
  due_date IS NULL, due_date ASC, due_time IS NULL, due_time ASC,
  CASE priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
  created_at DESC`;

export function listTasks(filter?: { status?: TaskStatus; projectId?: string; clientId?: string }): Task[] {
  const where: string[] = [];
  const params: string[] = [];
  if (filter?.status) {
    where.push("status = ?");
    params.push(filter.status);
  }
  if (filter?.projectId) {
    where.push("project_id = ?");
    params.push(filter.projectId);
  }
  if (filter?.clientId) {
    where.push("client_id = ?");
    params.push(filter.clientId);
  }
  const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ${ORDER}`;
  return (getDb().prepare(sql).all(...params) as TaskRow[]).map(rowToTask);
}

export function getTask(id: string): Task | null {
  const row = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

export function createTask(input: {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string;
  clientId?: string;
  dueDate?: string;
  dueTime?: string;
  tags?: string[];
}): Task {
  const id = randomUUID();
  const status = input.status ?? "pendente";
  getDb()
    .prepare(
      `INSERT INTO tasks (id, title, description, status, priority, project_id, client_id, due_date, due_time, tags, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.title,
      input.description ?? null,
      status,
      input.priority ?? "normal",
      input.projectId ?? null,
      input.clientId ?? null,
      input.dueDate ?? null,
      input.dueTime ?? null,
      JSON.stringify(input.tags ?? []),
      status === "concluido" ? new Date().toISOString() : null
    );
  return getTask(id)!;
}

export function updateTask(
  id: string,
  partial: Partial<Omit<Task, "id" | "createdAt" | "completedAt">>
): Task {
  const current = getTask(id);
  if (!current) throw new Error("Tarefa não encontrada.");
  const merged = { ...current, ...partial };

  let completedAt = current.completedAt;
  if (merged.status === "concluido" && current.status !== "concluido") {
    completedAt = new Date().toISOString();
    recordActivity("task_completed", id, merged.title);
  } else if (merged.status !== "concluido") {
    completedAt = null;
  }

  getDb()
    .prepare(
      `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, project_id = ?, client_id = ?,
         due_date = ?, due_time = ?, tags = ?, completed_at = ? WHERE id = ?`
    )
    .run(
      merged.title,
      merged.description,
      merged.status,
      merged.priority,
      merged.projectId,
      merged.clientId,
      merged.dueDate,
      merged.dueTime,
      JSON.stringify(merged.tags),
      completedAt,
      id
    );
  return getTask(id)!;
}

export function updateTaskStatus(id: string, status: TaskStatus): Task {
  return updateTask(id, { status });
}

export function deleteTask(id: string): void {
  getDb().prepare("DELETE FROM tasks WHERE id = ?").run(id);
}
