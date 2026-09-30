-- Qyrex 1.9.0: tempo de uso do app por dia (data local). Só contadores.
CREATE TABLE IF NOT EXISTS app_usage (
  day TEXT PRIMARY KEY,
  seconds INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0
);
