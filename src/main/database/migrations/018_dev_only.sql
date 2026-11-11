-- qyrex: foreign_keys off
-- Qyrex 100% para devs: saem clientes, cobranças/manutenção mensal, marketing e WhatsApp.
-- Os dados dessas áreas são apagados de vez (o backup "antes de migrar" guarda a cópia anterior).
--
-- A primeira linha pede ao executor (db.ts) que desligue as chaves estrangeiras durante esta
-- migration: projects e tasks são reconstruídas sem client_id (receita oficial do SQLite para
-- tirar uma coluna com REFERENCES). Sem isso, DROP TABLE projects dispararia o ON DELETE CASCADE
-- das automações. O executor roda PRAGMA foreign_key_check antes de confirmar.

DROP TABLE IF EXISTS marketing_content;

CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  local_path TEXT NOT NULL,
  technologies TEXT NOT NULL DEFAULT '[]',
  github_url TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT,
  icon_mode TEXT NOT NULL DEFAULT 'auto',
  status TEXT NOT NULL DEFAULT 'ativo',
  archived_at TEXT
);
INSERT INTO projects_new (id, name, description, local_path, technologies, github_url, favorite, created_at, last_opened_at, icon_mode, status, archived_at)
  SELECT id, name, description, local_path, technologies, github_url, favorite, created_at, last_opened_at, icon_mode, status, archived_at FROM projects;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  priority TEXT NOT NULL DEFAULT 'normal',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  due_date TEXT,
  due_time TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
INSERT INTO tasks_new (id, title, description, status, priority, project_id, due_date, due_time, tags, created_at, completed_at)
  SELECT id, title, description, status, priority, project_id, due_date, due_time, tags, created_at, completed_at FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

DROP TABLE IF EXISTS clients;

-- Restos das áreas que saíram.
DELETE FROM recent_items WHERE item_type IN ('client', 'marketing');
DELETE FROM integrations WHERE provider = 'whatsapp' OR id = 'whatsapp';
DELETE FROM notification_log WHERE key LIKE 'billing:%' OR key LIKE 'marketing:%';
ALTER TABLE user_settings DROP COLUMN business_mode;
UPDATE user_settings SET notifications = json_remove(notifications, '$.billing', '$.marketing') WHERE json_valid(notifications);
