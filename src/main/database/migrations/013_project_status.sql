-- Qyrex 2.0: status do projeto (ativo/pausado/concluido) e arquivamento.
-- Arquivar só esconde do dia a dia: o cadastro, as tarefas e a pasta continuam.
ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE projects ADD COLUMN archived_at TEXT;
