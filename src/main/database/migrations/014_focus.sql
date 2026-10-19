-- Qyrex 2.0: sessões de foco (temporizador com pausa, ligadas a projeto/tarefa).
-- focused_seconds guarda o tempo já contado; enquanto roda, resumed_at marca o
-- início do trecho atual (gravado a cada minuto para não perder tempo num travamento).
CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  label TEXT,
  planned_minutes INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  focused_seconds INTEGER NOT NULL DEFAULT 0,
  resumed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running'
);
CREATE INDEX IF NOT EXISTS idx_focus_started ON focus_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_focus_project ON focus_sessions(project_id);

ALTER TABLE user_settings ADD COLUMN focus TEXT NOT NULL DEFAULT '{"minutes":25,"dailyGoalMinutes":0,"notify":true}';
