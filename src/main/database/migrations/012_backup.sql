-- Qyrex 2.0: preferências de backup local (automático ligado, 1 vez por dia, guarda os 10 últimos automáticos).
ALTER TABLE user_settings ADD COLUMN backup TEXT NOT NULL DEFAULT '{"auto":true,"intervalDays":1,"keep":10}';
