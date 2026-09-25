-- QrzSpace 1.0.1: Discord Rich Presence com o aplicativo oficial "QrzSpace"
-- (Application ID público, criado no Discord Developer Portal). Liga a
-- presença por padrão; o nome do projeto continua oculto (showProject: false).
-- Só altera quem ainda não configurou um Client ID próprio.
UPDATE user_settings
SET discord = '{"enabled":true,"clientId":"1552906629085794356","showProject":false}'
WHERE json_extract(discord, '$.clientId') IS NULL;
