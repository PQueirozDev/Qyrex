# PQueiroz Workspace

Central de trabalho desktop de Pedro Queiroz: um app Electron que reúne projetos,
tarefas, arquivos, IA, clientes, marketing e integrações num único lugar — sem
recriar VS Code, WhatsApp ou Spotify, apenas orquestrando-os.

> Status: **FASE 1 (Fundação)**, **FASE 2 (Central de IA)** e **FASE 3 (Clientes,
> Marketing, Agenda)** implementadas. Veja o roadmap abaixo.

## Funcionalidades

**FASE 1**
- Dashboard com tarefas do dia, projetos recentes e ações rápidas
- Gerenciador de projetos: detecta tecnologias via `package.json`, mostra branch/status
  git, abre no VS Code, terminal ou Explorer
- Tarefas: criar, concluir, filtrar (Hoje / Próximas / Todas / Concluídas), excluir
- Arquivos: navegação, criação de pastas, exclusão com confirmação — restrito aos
  diretórios que você autorizar em Configurações
- Command Palette global (`Ctrl+K`) com fuzzy search
- Banco local SQLite com migrations versionadas
- Bandeja do sistema (Windows) e ciclo de vida de janela

**FASE 2 — Central de IA**
- Providers modulares para Claude (Anthropic), OpenAI e Gemini (Google), atrás de uma
  interface comum (`src/main/integrations/providers`) — adicionar um novo provider é
  um arquivo novo + uma linha no registro
- Conversas com histórico persistido no SQLite, streaming token a token, botão de
  **interromper geração** e **regenerar resposta**
- Markdown renderizado, syntax highlighting e botão de copiar em blocos de código
- Contexto de projeto: você escolhe explicitamente quais arquivos anexar a uma
  mensagem — nada é enviado à IA automaticamente, e os arquivos anexados ficam
  visíveis na própria mensagem
- Página Integrações: conectar/testar/desconectar cada provider, com a API key
  cifrada pelo `safeStorage` do Electron (cofre de credenciais do SO), nunca em
  texto puro

**FASE 3 — Clientes, Marketing, Agenda**
- Clientes (CRM): busca, status (Ativo/Inativo/Prospecto), manutenção mensal e
  próxima cobrança, atalhos para WhatsApp/telefone/Instagram/email
- Marketing: quadro por status (Ideia → Produzindo → Pronto → Publicado), tipos
  Post/Story/Reel, vínculo opcional com cliente e data agendada
- Agenda: visão de mês + lista de próximos compromissos, criação de evento por
  clique no dia; arquitetura pronta para sincronizar com Google Calendar (fonte
  `"google"` já modelada no schema), mas a integração OAuth em si ainda não está
  ligada — ver "Outras integrações"

As demais áreas (WhatsApp, Spotify, GitHub, AI Council) aparecem na interface como
"em breve" — ver Roadmap.

## Tecnologias

Electron · React 18 · TypeScript · Vite · Tailwind CSS · Zustand · better-sqlite3 ·
react-markdown + rehype-highlight (Central de IA)

## Instalação e desenvolvimento

Pré-requisitos: Node.js 20+, e no Windows as ferramentas de build nativas
(`npm install --global windows-build-tools` ou Visual Studio Build Tools, exigidas
pelo `better-sqlite3`, que é um módulo nativo).

```bash
npm install
npm run dev:app     # sobe o Vite + Electron juntos, com hot reload no renderer
```

Comandos úteis:

```bash
npm run typecheck   # checa os dois tsconfig (renderer e main)
npm run lint
npm run test
```

## Build / instalador Windows

```bash
npm run dist         # gera PQueiroz-Workspace-Setup-<versão>.exe em /release
```

O instalador é gerado pelo `electron-builder` (config em `electron-builder.json`):
NSIS, com atalhos de desktop/menu iniciar e desinstalador.

## Configuração inicial

Na primeira execução, vá em **Configurações → Diretórios autorizados** e adicione
as pastas onde ficam seus projetos (ex.: `C:\Projetos`). O Workspace **só** lê,
lista ou modifica arquivos dentro desses diretórios — é a base do modelo de
segurança do app.

## Segurança

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` na janela principal
- O renderer só fala com o main process através de canais IPC explícitos e
  tipados (`src/preload/index.ts` → `src/main/ipc/handlers.ts`)
- Todo processo externo (`code`, `powershell`, `git`) é disparado via `spawn` com
  argumentos em array — nunca por concatenação de string num shell
- Todo acesso a arquivo passa por `assertPathAllowed`, que valida o caminho
  resolvido contra a allowlist configurada pelo usuário (proteção contra path
  traversal)
- Ações destrutivas (excluir arquivo, etc.) exigem confirmação explícita do
  usuário antes de chegar ao handler IPC — inclusive quando sugeridas por uma IA
- Nenhuma API key fica hardcoded ou é logada; tokens de integrações (fase 2+)
  serão guardados no keychain do sistema operacional, não em texto puro no SQLite

## Estrutura

```
src/
  main/          # processo Electron: ipc, services, security, database
  preload/       # única ponte exposta ao renderer via contextBridge
  renderer/      # React (components, pages, hooks, stores, services)
  shared/        # tipos compartilhados entre os três mundos acima
```

## Roadmap

- ~~**FASE 2** — Central de IA (Claude / OpenAI / Gemini, providers modulares),
  contexto de projeto com seleção explícita de arquivos, Integrações~~ ✅
- ~~**FASE 3** — Clientes (CRM), Marketing (calendário de conteúdo), Agenda~~ ✅
  (a sincronização OAuth com Google Calendar em si ainda não está implementada)
- **FASE 4** — Spotify (mini player via Web API), GitHub (commits/PRs/issues),
  WhatsApp (`wa.me` → futura Cloud API), notificações desktop
- **FASE 5** — AI Council (multi-agente + síntese), automações avançadas
