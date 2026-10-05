-- Ícone dos projetos: "auto" detecta o ícone/logo do app na pasta do projeto,
-- "custom" usa uma imagem escolhida pelo usuário e "none" mostra só as iniciais.
ALTER TABLE projects ADD COLUMN icon_mode TEXT NOT NULL DEFAULT 'auto';
