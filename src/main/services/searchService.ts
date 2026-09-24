import { getDb } from "../database/db.js";
import { listClients, likePattern } from "./clientService.js";
import { listProjects } from "./projectService.js";
import { getTask } from "./taskService.js";
import { listMarketingContent } from "./marketingService.js";
import { searchFiles } from "./fileService.js";
import type { SearchResults, Task } from "../../shared/types.js";

/** Busca global (barra do topo / Ctrl+K): projetos, tarefas, clientes, marketing e arquivos permitidos. */
export function globalSearch(query: string, includeFiles = true): SearchResults {
  const q = query.trim();
  if (q.length < 2) return { projects: [], tasks: [], clients: [], marketing: [], files: [] };
  const lower = q.toLowerCase();
  const pattern = likePattern(q);

  const projects = listProjects()
    .filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.description?.toLowerCase().includes(lower) ||
        p.technologies.some((t) => t.toLowerCase().includes(lower))
    )
    .slice(0, 8);

  const taskIds = getDb()
    .prepare(
      `SELECT id FROM tasks WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\'
       ORDER BY status = 'concluido', created_at DESC LIMIT 8`
    )
    .all(pattern, pattern, pattern) as { id: string }[];
  const tasks = taskIds.map((r) => getTask(r.id)).filter((t): t is Task => t !== null);

  const clients = listClients(q).slice(0, 8);

  const marketing = listMarketingContent()
    .filter(
      (m) =>
        m.title.toLowerCase().includes(lower) ||
        m.caption?.toLowerCase().includes(lower) ||
        m.description?.toLowerCase().includes(lower)
    )
    .slice(0, 8);

  let files: SearchResults["files"] = [];
  if (includeFiles) {
    try {
      files = searchFiles(q, undefined, 12);
    } catch {
      files = [];
    }
  }

  return { projects, tasks, clients, marketing, files };
}
