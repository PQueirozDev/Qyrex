# CLAUDE.md

Guia para o Claude Code continuar o **PQueiroz Workspace**: um app desktop (Electron + React + TypeScript + SQLite) que funciona como central de trabalho de um dev/freelancer. Ele reúne projetos, tarefas, arquivos, IA, clientes, marketing, agenda, WhatsApp, Spotify e GitHub. O app **orquestra** os programas externos (VS Code, terminal, Explorer) e não recria nenhum deles.

Sempre responda e comente o código em **português do Brasil**, com acentuação correta.

## Estado atual

Backend e nova UI prontos. `npm run check` passa (typecheck, lint sem warnings e 142 testes; 3 testes de caminho do Windows são pulados fora do Windows) e `npm run build` gera o renderer.

### Feito
- `src/main/**`: ipc/handlers com validação zod e checagem de remetente, services, integrações (Claude via `@anthropic-ai/sdk`, OpenAI e Gemini via REST, GitHub com PAT, Spotify com PKCE, Google Calendar com OAuth loopback), segurança (paths, commands, exec, secrets, validation), logger com redaction, notificações, terminal node-pty, tray e CSP.
- `src/preload/index.ts`: API completa em `window.workspace` (fonte da verdade dos canais IPC).
- `src/shared/types.ts`: contrato de tipos.
- Renderer: todas as páginas no novo padrão (`pageParam`, `attempt()`/`unwrap()`, `confirmAction()`/`promptText()`, `PageHeader`, `EmptyState`, loading/erro): Onboarding, Dashboard, Projects, TerminalPage, Tasks, FilesPage, Agenda, Clients, Marketing, WhatsApp, AICenter (chat + AI Council), Integrations e Settings. `MessageBubble` tem o botão "Executar" com diálogo de permissão e `AttachFilesDialog` foi reescrito.
- `scripts/generate-icons.mjs` (`npm run icons`) gera `build/icon.png` (512px) e `build/icon.ico` (16–256px) sem dependências.
- `electron-builder.json`: NSIS x64, `artifactName: "PQueiroz-Workspace-Setup-${version}.${ext}"`, `asarUnpack` de `better-sqlite3` e `@lydell/**`, atalhos, desinstalador e `publish: null` (sem auto-update).
- `README.md` reescrito.

### Falta
1. `npm run dist` **no Windows** → `release/PQueiroz-Workspace-Setup-x.y.z.exe`. Em Linux o electron-builder falha ao recompilar `better-sqlite3` para Windows (cross-compile não é suportado).
2. Testar o app de verdade no Electron (Windows): terminal integrado (node-pty), OAuth do Google/Spotify, git commit/pull/push e o fluxo "Executar" de comandos. Na web as páginas só foram testadas no Chromium com `window.workspace` simulado.

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
