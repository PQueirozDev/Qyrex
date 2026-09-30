-- Qyrex 1.9.0: animação de abertura (logo + nome), ligada por padrão.
ALTER TABLE user_settings ADD COLUMN splash_animation INTEGER NOT NULL DEFAULT 1;
