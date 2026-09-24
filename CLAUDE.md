# CLAUDE.md

Guia para o Claude Code continuar o **PQueiroz Workspace**: um app desktop (Electron + React + TypeScript + SQLite) que funciona como central de trabalho de um dev/freelancer. Ele reúne projetos, tarefas, arquivos, IA, clientes, marketing, agenda, WhatsApp, Spotify e GitHub. O app **orquestra** os programas externos (VS Code, terminal, Explorer) e não recria nenhum deles.

Sempre responda e comente o código em **português do Brasil**, com acentuação correta.

## Estado atual (WIP)

O **backend (main process) está pronto** e os **142 testes passam**. A **nova UI está pela metade**: o `App.tsx` já importa páginas que ainda **não foram reescritas**, então o renderer **não compila** até elas existirem.

### Feito
- `src/main/**`: tudo reescrito. Inclui ipc/handlers com validação zod e checagem de remetente, services, integrações (Claude via `@anthropic-ai/sdk`, OpenAI e Gemini via REST, GitHub com PAT, Spotify com PKCE, Google Calendar com OAuth loopback), segurança (paths, commands, exec, secrets, validation), logger com redaction, notificações, terminal node-pty, tray e CSP.
- `src/preload/index.ts`: API completa exposta em `window.workspace` (fonte da verdade dos canais IPC).
- `src/shared/types.ts`: contrato de tipos.
- Renderer:
  - `lib/` (api, format, fuzzy, cn)
  - `stores/` (UI, settings, projects, tasks, clients, marketing, calendar, AI)
  - `components/ui/` (Button, Card, Dialog e `primitives.tsx`, com Badge, Segmented, Switch, Menu, Drawer, EmptyState etc.)
  - `components/` (Overlays, TaskFormDialog, Sidebar, SpotifyMiniPlayer, CommandPalette, Header)
  - `App.tsx`, `pages/Onboarding.tsx`, `pages/Dashboard.tsx`, `pages/Tasks.tsx`

### Falta (em ordem sugerida)
1. **Reescrever as páginas** com o novo padrão: `useUIStore().pageParam`, `attempt()`/`unwrap()`, `confirmAction()`/`promptText()`, `PageHeader`, `EmptyState` e estados de loading/erro.
   - `pages/Projects.tsx`: grid com favoritos. O diálogo "Novo projeto" usa `system.pickDirectory` + `projects.detect` para pré-preencher. Tem um Drawer de detalhes com git (status, `git.changes`, `git.commits`), GitHub (`github.overview` com issues e PRs), botões Commit/Pull/Push com `confirmAction({danger:true})` e `confirmed:true`, edição, remoção e tarefas do projeto. `pageParam === "new"` abre o diálogo; um id de projeto abre o drawer.
   - `pages/TerminalPage.tsx` (NOVO): xterm.js (`@xterm/xterm`, `@xterm/addon-fit`) ligado a `window.workspace.terminal.*`, com abas e escolha de projeto/pasta autorizada e shell (PowerShell/CMD). `pageParam` = id do projeto. Se `terminal.available()` for false, faz fallback para `system.openTerminal`.
   - `pages/FilesPage.tsx`: escolha do diretório autorizado, breadcrumb e lista. Ações: abrir (`system.openFile`), renomear (`promptText`), copiar/mover (área de "colar aqui"), nova pasta, abrir no Explorer, abrir no VS Code, copiar caminho, excluir (confirm danger) e busca (`files.search`). Painel de preview (`files.preview`: imagem, texto com highlight, markdown renderizado). `pageParam` = "search" ou o caminho de um arquivo/pasta.
   - `pages/Agenda.tsx`: visões dia, semana e mês, com criar/editar/excluir evento. Eventos `source:"google"` são só leitura. Tem um botão "Sincronizar Google" (`googleCalendar.sync`) e as datas são locais ("AAAA-MM-DDTHH:MM:SS"). `pageParam === "new"` abre a criação.
   - `pages/Clients.tsx`: lista/busca e Drawer do cliente com dados editáveis, status, financeiro (manutenção e próxima cobrança), projetos e tarefas vinculados, marketing do cliente, pasta de arquivos (`filesPath`, escolhida com `pickDirectory`) e atalhos para WhatsApp (`system.openWhatsAppChat`), Instagram, email e telefone. `pageParam` = "new", "search" ou id.
   - `pages/Marketing.tsx`: Kanban por status (Ideia → Produzindo → Pronto → Publicado), calendário de conteúdo semanal, input rápido de IDEIAS e diálogo com tipo (post/story/reel), cliente, título, descrição, legenda, data e arquivos relacionados. `pageParam` = "new" ou id.
   - `pages/WhatsApp.tsx` (NOVO): abrir o Desktop (`system.whatsappStatus` indica se está instalado) ou o Web, lista de contatos dos clientes com "Abrir conversa" e mensagem opcional, campo de número avulso (link `wa.me`) e uma nota sobre a futura WhatsApp Cloud API. **Nunca usar bibliotecas não oficiais.**
   - `pages/AICenter.tsx`:
     - Chat: lista de conversas; nova conversa com provider/modelo/projeto (use `useAIStore`); `providers[].models` e `refreshModels`; streaming, interromper e regenerar (`ai.regenerate`); anexar arquivos só do projeto, mostrando claramente quais vão ser enviados.
     - Aba **AI Council**: seleção de providers conectados e um diálogo que mostra quantos providers serão usados **antes** de enviar. O `confirmedCount` deve bater com `targets.length`. Respostas lado a lado via `onStreamRequest(requestId)` e "Sintetizar respostas" (`ai.council.synthesize`).
     - `pageParam`: "anthropic", "openai", "google" ou "council".
     - Adaptar `components/MessageBubble.tsx`: nos blocos ```powershell/bash/sh/cmd, adicionar um botão "Executar". Ele chama `commands.assess` e abre o diálogo "Claude deseja executar: ..." com [Cancelar] [Permitir uma vez] [Permitir]. Se `risk === "dangerous"`, mostrar "⚠️ AÇÃO SENSÍVEL" só com Cancelar/Confirmar, sem "Permitir sempre". Depois chama `commands.run({command, cwd: projeto.localPath, decision, confirmed:true})` e mostra a saída.
     - Adaptar `components/AttachFilesDialog.tsx`.
   - `pages/Integrations.tsx`: cards para Claude, OpenAI, Gemini, GitHub, Google Calendar, Spotify e WhatsApp, com status 🟢/⚪/🔴 (`integrations.list`) e Conectar/Desconectar/Testar. As keys aparecem só mascaradas (`maskedKey`). Instruções: Spotify precisa do redirect `http://127.0.0.1:43821/callback` e só do Client ID; Google precisa de um OAuth Client "App para computador" (Client ID + Secret); GitHub usa um fine-grained PAT.
   - `pages/Settings.tsx`: Aparência (Dark/Light/System), Inicialização (iniciar com Windows, minimizar para a bandeja), Perfil (nome), Diretórios autorizados (`settings.addAllowedDir()` sem argumento abre o seletor), VS Code (`system.pickVSCode`), Terminal, IA (provider e modelo padrão), Notificações (4 toggles), Privacidade (lista `commands.listAllowed` e `revoke`, botão "Abrir pasta de logs" via `system.openLogs`) e Sobre.
2. Remover `components/ComingSoon.tsx` e `components/ConfirmDialog.tsx` (substituídos por `confirmAction`).
3. `npm run typecheck && npm run lint && npm test` sem erros nem warnings.
4. Criar `scripts/generate-icons.mjs` (gera `build/icon.png` 512px e `build/icon.ico`; o ícone atual é placeholder) e revisar o `electron-builder.json`: NSIS, `artifactName: "PQueiroz-Workspace-Setup-${version}.${ext}"`, `asarUnpack` para `better-sqlite3` e `@lydell/node-pty`, atalhos e desinstalador, **sem** auto-update habilitado.
5. `npm run dist` → `release/PQueiroz-Workspace-Setup-x.y.z.exe`.
6. Reescrever o `README.md` (funcionalidades, stack, instalação, dev, build, configuração das integrações, segurança, roadmap).

## Comandos

```bash
npm install
npm run dev:app      # compila o main e sobe Vite (5173) + Electron com HMR
npm run typecheck    # tsconfig.main.json + tsconfig.renderer.json
npm run lint         # eslint, --max-warnings 0
npm test             # vitest DENTRO do Electron (scripts/run-tests.mjs, ELECTRON_RUN_AS_NODE=1)
npm run check        # typecheck + lint + test
npm run build        # main (tsc + copy-migrations) + renderer (vite)
npm run dist         # build + instalador Windows (electron-builder)
```

- O `package.json` raiz é `"type": "module"` (por causa do Vite/Tailwind). O main/preload são compilados para **CommonJS** em `dist-electron/`, e `scripts/copy-migrations.mjs` grava `dist-electron/package.json` com `"type":"commonjs"`. Não remova isso.
- Módulos nativos: `better-sqlite3@13` (N-API, prebuilds incluídos) e `@lydell/node-pty` (prebuilds). Não precisa de Visual Studio Build Tools.
- O npm 11 usa `allowScripts` no `package.json`. Se o binário do Electron não baixar, rode `node node_modules/electron/install.js`.
- **Ambiente:** o app é feito para **Windows**. Em Linux (ex.: Claude Code na web), typecheck, lint e build do renderer funcionam, mas alguns testes são específicos de Windows (junction, `SystemRoot`) e rodar o Electron exige display. Se um teste falhar só por causa da plataforma, proteja-o com `process.platform`, sem enfraquecê-lo.

## Arquitetura

```
src/
  main/            # processo Electron (Node)
    index.ts       # janela, tray, CSP, permissões, single-instance, notificações
    ipc/handlers.ts# TODOS os canais IPC: handle() → checagem de remetente → zod → service
    services/      # regras de negócio (SQLite via getDb())
    integrations/  # providers de IA (interface comum), oauth.ts, github, spotify, googleCalendar
    security/      # paths (allowlist), commands (risco/protocolos), exec (spawn sem shell), secrets, validation (zod)
    database/      # db.ts + migrations/*.sql (versionadas, aplicadas em ordem)
    logger.ts      # INFO/WARNING/ERROR em <userData>/logs, com redact()
  preload/index.ts # única ponte: contextBridge.exposeInMainWorld("workspace", api)
  renderer/        # React 18 + Tailwind (cores via CSS vars em styles/index.css)
    stores/        # zustand; useUIStore tem navegação (page + pageParam), toasts, confirmAction, promptText
    lib/api.ts     # unwrap() / attempt() para IpcResult
  shared/types.ts  # contrato main ↔ renderer
tests/             # vitest; tests/setup.ts mocka "electron"; helpers.ts cria banco em memória
```

- Navegação sem router: `useUIStore.navigate(page, param)`. As páginas leem `pageParam`.
- Novo canal IPC: service → `handle()` em `handlers.ts` com schema em `security/validation.ts` → método em `preload/index.ts` → tipos em `shared/types.ts` → teste.
- Novo provider de IA: arquivo em `integrations/providers/` implementando `AIProvider` + uma linha em `providers/index.ts`.
- Nova migration: `00N_nome.sql`. Nunca edite uma migration já aplicada.

## Regras de segurança (não negociáveis)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; o renderer só fala via `window.workspace`.
- Todo input de IPC passa por zod (`parse`). Campos desconhecidos são descartados. Retorne sempre `IpcResult`.
- Todo acesso a arquivo passa por `assertPathAllowed*` (allowlist do usuário, resolve `..` e symlinks/junctions). Raiz de disco, pastas do sistema e a home inteira não podem ser autorizadas.
- Processos externos só via `security/exec.ts` (`spawn` com array, `shell:false`; `.cmd/.bat` são proibidos). **Nunca** concatene input do usuário num comando. O VS Code é aberto pelo `Code.exe` real (`detectVSCode`), não pelo `code.cmd`.
- Ações sensíveis (excluir/mover arquivo, commit/pull/push, rodar comando) exigem `confirmed: true`, enviado só depois do diálogo da UI.
- A IA **nunca** executa nada sozinha: não há tool-calling com execução. Comandos `dangerous` nunca podem ser "Permitir sempre". Push nunca é automático e nunca é `--force`.
- Segredos só em `security/secrets.ts` (safeStorage/DPAPI). Nunca no SQLite, no renderer ou nos logs. Na UI, só key mascarada.
- URLs externas passam por `isProtocolAllowed` (http, https, mailto, tel). Arquivos executáveis nunca são "abertos", só revelados no Explorer.
- AI Council: nunca disparar mais providers do que o usuário confirmou (`confirmedCount`).
- WhatsApp: apenas links oficiais (`wa.me` / `whatsapp://`). Nada de bibliotecas não oficiais.

## Convenções

- TypeScript strict, sem `any` (o lint falha com warnings). Nada de botões que não fazem nada, dados mockados ou TODO fingindo implementação.
- Datas: use `lib/format.ts` (horário local). Não use `toISOString().slice(0,10)` para "hoje".
- Não use `window.prompt`/`window.confirm` (não funcionam no Electron). Use `promptText`/`confirmAction`.
- Visual: dark premium e minimalista (Linear/Raycast/Vercel). Use tokens `bg`, `bg-elevated`, `bg-card`, `bg-hover`, `border(-subtle)`, `text(-muted|-faint)`, `accent`, `danger/success/warning`, as classes `.input`, `.label`, `.section-title` e as animações `animate-pop-in`/`fade-in`/`slide-in`.
- Modelos Claude: padrão `claude-opus-5`. Lista viva via `models.list` e fallback em `providers/anthropic.ts`.
- Commits pequenos por etapa. Rode `npm run check` antes de cada commit.
