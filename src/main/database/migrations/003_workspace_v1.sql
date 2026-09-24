-- FASES 1–5: campos adicionais para configurações, tarefas, clientes, marketing,
-- agenda, notificações e comandos autorizados pela IA.
-- Nenhum token/segredo é gravado aqui: segredos ficam em secrets.enc.json,
-- cifrado com o cofre do sistema operacional (ver security/secrets.ts).

ALTER TABLE user_settings ADD COLUMN notifications TEXT NOT NULL DEFAULT '{"tasks":true,"events":true,"billing":true,"marketing":true}';
ALTER TABLE user_settings ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN vscode_path TEXT;

ALTER TABLE tasks ADD COLUMN completed_at TEXT;

ALTER TABLE clients ADD COLUMN files_path TEXT;

ALTER TABLE marketing_content ADD COLUMN files TEXT NOT NULL DEFAULT '[]';

ALTER TABLE calendar_events ADD COLUMN description TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_external ON calendar_events(source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_starts ON calendar_events(starts_at);

CREATE INDEX IF NOT EXISTS idx_marketing_date ON marketing_content(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_recent_opened ON recent_items(opened_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON ai_messages(conversation_id, created_at);

-- Evita notificar o mesmo lembrete mais de uma vez.
CREATE TABLE IF NOT EXISTS notification_log (
  key TEXT PRIMARY KEY,
  notified_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Comandos que o usuário escolheu "Permitir sempre" quando sugeridos pela IA.
-- Comandos classificados como perigosos NUNCA entram aqui (validado no main).
CREATE TABLE IF NOT EXISTS allowed_commands (
  command TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
