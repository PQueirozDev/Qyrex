-- FASE 2: registra quais arquivos foram explicitamente anexados a cada mensagem,
-- para manter o histórico de "o que foi enviado para a IA" auditável.
ALTER TABLE ai_messages ADD COLUMN attached_files TEXT NOT NULL DEFAULT '[]';
