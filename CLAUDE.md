# CLAUDE.md

Guia para o Claude Code continuar o **QrzSpace**: um app desktop (Electron + React + TypeScript + SQLite) que funciona como central de trabalho de um dev/freelancer. Ele reúne projetos, tarefas, arquivos, IA, clientes, marketing, agenda, WhatsApp, Spotify e GitHub. O app **orquestra** os programas externos (VS Code, terminal, Explorer) e não recria nenhum deles.

Sempre responda e comente o código em **português do Brasil**, com acentuação correta.

## Estado atual (v1.0.0)

App completo e publicado. `npm run check` passa (typecheck, lint sem warnings e 173 testes; 3 testes de caminho do Windows são pulados fora do Windows).

### Feito
- `src/main/**`: ipc/handlers com validação zod e checagem de remetente, services, integrações (Claude via `@anthropic-ai/sdk`, OpenAI e Gemini via REST, GitHub com PAT, Spotify com PKCE, Google Calendar com OAuth loopback, Discord Rich Presence via named pipe), segurança (paths, commands, exec, secrets, validation), logger com redaction (inclusive cookies), notificações, terminal node-pty, tray, CSP e atualização automática (`services/updateService.ts`, electron-updater).
- `src/preload/index.ts`: API completa em `window.workspace` (fonte da verdade dos canais IPC).
- Renderer: todas as páginas, incluindo **Novidades** (`pages/PatchNotes.tsx`) e **Configurações** com seletor visual de temas, idioma, Discord e atualizações.
- **Temas**: `lib/themes.ts` (catálogo) + blocos `:root[data-theme="<id>"]` em `styles/index.css`. Temas: dark, light, midnight, violet, sand (+ system).
- **Idioma (i18n)**: textos em português são a chave; `src/shared/locales/en.ts` traduz. Renderer usa `tr()` de `@/lib/i18n`; main usa `translate(lang, ...)` de `shared/i18n`; textos que só são traduzidos depois (enviados por variável) são marcados com `tm()`. O teste `tests/i18n.test.ts` falha se faltar tradução, se sobrar chave morta ou se placeholders `{x}` não baterem. `node scripts/i18n-keys.cjs --missing` lista o que falta.
- **Patch notes**: `src/shared/changelog.ts` (pt/en). O teste exige que a versão do `package.json` seja a primeira entrada.
- **Atualizações**: publicadas em **PQueirozDev/QrzSpace-releases** (repositório público só com instaladores; este repositório de código é privado). `npm run release` publica usando o token do `gh` só durante o build.

### Validado no Windows (2026-09-25)
- Instalador NSIS com `npmRebuild: false` (módulos nativos N-API com prebuilds).
- E2E via DevTools Protocol: 12+ páginas sem erros de console; os 5 temas; interface inteira em inglês sem texto em português; Discord com o app do Discord aberto (Client ID inválido → status "erro"); diálogo de novidades pós-atualização.
- Atualização automática de ponta a ponta com feed local (`QRZ_UPDATE_TEST_URL=http://127.0.0.1:<porta>/`, aceito só em localhost): app instalado 1.0.0 baixou, verificou, instalou e reabriu como 1.0.1. Instalador adulterado foi recusado (`sha512 checksum mismatch`).

### Falta (depende do usuário)
- Credenciais reais: API keys (Claude, OpenAI, Gemini), token do GitHub, OAuth do Spotify/Google, Client ID do Discord.
- Opcional: assinatura de código do instalador (sem certificado, o SmartScreen avisa na primeira execução).

## Comandos

```bash
npm install
npm run dev:app      # compila o main e sobe Vite (5173) + Electron com HMR
npm run typecheck    # tsconfig.main.json + tsconfig.renderer.json
npm run lint         # eslint, --max-warnings 0
npm test             # vitest DENTRO do Electron (scripts/run-tests.mjs, ELECTRON_RUN_AS_NODE=1)
npm run check        # typecheck + lint + test
npm run build        # main (tsc + copy-migrations) + renderer (vite)
npm run dist         # build + instalador Windows (sem publicar)
npm run release      # check + build + publica a versão em PQueirozDev/QrzSpace-releases
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
- Texto novo na UI: sempre `tr("texto em português")` e a tradução em `src/shared/locales/en.ts`. Frases com números/nomes usam placeholders: `tr("{n} tarefa(s)", { n })` — nunca concatenar pedaços.
- Nova versão: bump no `package.json` + entrada em `src/shared/changelog.ts` + `npm run release`.
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
