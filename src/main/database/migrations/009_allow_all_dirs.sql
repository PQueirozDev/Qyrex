-- Qyrex 1.9.2: opção de liberar o acesso a todas as pastas do PC (sem allowlist).
ALTER TABLE user_settings ADD COLUMN allow_all_dirs INTEGER NOT NULL DEFAULT 0;
