-- QrzSpace 1.0: idioma, Discord Rich Presence, atualização automática e patch notes.
ALTER TABLE user_settings ADD COLUMN language TEXT NOT NULL DEFAULT 'pt';
ALTER TABLE user_settings ADD COLUMN discord TEXT NOT NULL DEFAULT '{"enabled":false,"clientId":null,"showProject":false}';
ALTER TABLE user_settings ADD COLUMN auto_update INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN last_seen_version TEXT;
