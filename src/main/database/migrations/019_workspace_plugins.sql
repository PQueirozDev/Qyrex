-- Qyrex 2.2: notas por projeto, links rápidos e plugins declarativos.
-- Só cria tabelas novas: nada existente é alterado ou apagado.

-- Notas em Markdown, uma por projeto (plugin "Notas do projeto").
CREATE TABLE IF NOT EXISTS project_notes (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Links rápidos (plugin "Links rápidos"): globais (project_id nulo) ou de um projeto.
CREATE TABLE IF NOT EXISTS quick_links (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_quick_links_project ON quick_links(project_id);

-- Plugins: os embutidos e os instalados de pacotes locais (só manifesto declarativo, nunca código).
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('builtin', 'local')),
  enabled INTEGER NOT NULL DEFAULT 1,
  -- Manifesto validado (JSON) dos plugins locais; nulo nos embutidos (vêm do código).
  manifest TEXT,
  installed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
