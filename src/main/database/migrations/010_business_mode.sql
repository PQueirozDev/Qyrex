-- Qyrex: modo Dev por padrão. As áreas de negócio (clientes, marketing, WhatsApp)
-- ficam ocultas até o usuário ligar o "Modo Negócio" nas configurações.
ALTER TABLE user_settings ADD COLUMN business_mode INTEGER NOT NULL DEFAULT 0;
