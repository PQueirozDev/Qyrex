-- Qyrex 2.0: ordem e visibilidade dos widgets do Início (vazio = padrão do app).
ALTER TABLE user_settings ADD COLUMN dashboard TEXT NOT NULL DEFAULT '{"order":[],"hidden":[]}';
