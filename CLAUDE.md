# CLAUDE.md

Guia para o Claude Code continuar o **QrzSpace**: um app desktop (Electron + React + TypeScript + SQLite) que funciona como central de trabalho de um dev/freelancer. Ele reúne projetos, tarefas, arquivos, IA, clientes, marketing, agenda, WhatsApp, Spotify e GitHub. O app **orquestra** os programas externos (VS Code, terminal, Explorer) e não recria nenhum deles.

Sempre responda e comente o código em **português do Brasil**, com acentuação correta.

## Estado atual (v1.6.0)

App completo e publicado. `npm run check` passa (typecheck, lint sem warnings e 205 testes; 3 testes de caminho do Windows são pulados fora do Windows). `npm run e2e` passa (24 etapas pela interface, com as APIs simuladas).

### Feito
- `src/main/**`: ipc/handlers com validação zod e checagem de remetente, services, integrações (Claude via `@anthropic-ai/sdk`, OpenAI e Gemini via REST, GitHub com PAT, Spotify com PKCE, Google Calendar com OAuth loopback, Discord Rich Presence via named pipe), segurança (paths, commands, exec, secrets, validation), logger com redaction (inclusive cookies), notificações, terminal node-pty, tray, CSP e atualização automática (`services/updateService.ts`, electron-updater).
- `src/preload/index.ts`: API completa em `window.workspace` (fonte da verdade dos canais IPC).
- Renderer: todas as páginas, incluindo **Novidades** (`pages/PatchNotes.tsx`) e **Configurações** com seletor visual de temas, idioma, Discord e atualizações.
- **Temas**: `lib/themes.ts` (catálogo) + blocos `:root[data-theme="<id>"]` em `styles/index.css`. Temas: dark, light, midnight, violet, sand (+ system).
- **Idioma (i18n)**: textos em português são a chave; `src/shared/locales/en.ts` traduz. Renderer usa `tr()` de `@/lib/i18n`; main usa `translate(lang, ...)` de `shared/i18n`; textos que só são traduzidos depois (enviados por variável) são marcados com `tm()`. O teste `tests/i18n.test.ts` falha se faltar tradução, se sobrar chave morta ou se placeholders `{x}` não baterem. `node scripts/i18n-keys.cjs --missing` lista o que falta.
- **Uso da IA**: `services/usageService.ts` registra tokens (só contadores) em `ai_usage` a cada `runStream`; providers informam via `onUsage`. Custo estimado só para modelos com preço conhecido (tabela Anthropic em `PRICES`). Aba "Uso" em `components/AIUsageView.tsx`.
- **IA pela assinatura**: `integrations/cli/subscriptions.ts` roda o Claude Code (`claude -p`, stream-json) e o Codex (`codex exec --json`) já logados no PC, com TODAS as ferramentas desligadas, cwd vazio e sessão efêmera. `aiService` usa isso quando `integrations.metadata.authMode === "subscription"` (Claude → claude, OpenAI → codex). Uso registrado como `claude-code/<modelo>` / `codex/<modelo>` (sem custo).
- **GitHub pelo gh**: `github.connectWithGhCli()` lê `gh auth token` direto para o cofre.
- **Mini player** (`components/MiniPlayer.tsx`): lê a mídia do Windows (GSMTC) por um PowerShell persistente com script fixo embutido (`integrations/media/mediaScript.ts`), comandos de lista fechada. Capa buscada por nome na Deezer/iTunes e entregue como data URL. A Web API do Spotify virou opcional.
- **Visual (1.6.0)**: `lib/pageIcons.ts` (`PAGE_ICONS`, ícone único por área: sidebar e `PageHeader icon`), `Avatar` (cor estável por nome, classe `.avatar`), `.surface` (véu de luz nos cards escuros), `.skeleton` (carregamento com brilho), checkbox e `select.input` estilizados no CSS global (não use `accent-*` nem seta nativa), pílula ativa com `layoutId` na sidebar/Configurações, kanbans com destaque de coluna ao arrastar.
- **HUD**: biblioteca `motion` (layout/spring). Barra de título nativa escondida (`titleBarOverlay`, cores sincronizadas com o tema via `system:setTitleBarColors`); `.drag-region`/`.no-drag`/`.titlebar-safe`, `.press`, `.shine`, `AnimatedValue`, `Segmented` com pílula deslizante.
- **Ícone**: fonte em `build/icon.svg` (cópia em `src/renderer/assets/logo.svg` para a barra lateral). `npm run icons` rasteriza pelo Electron e gera `build/icon.png` + `build/icon.ico` (PNG embutido). A atividade do Discord usa `icon.png` do repositório público QrzSpace-releases.
- **Notion**: `integrations/notion.ts` (token de integração interna no cofre, `Notion-Version: 2022-06-28`, URL em `endpoints.notion()`). Busca, leitura (blocos → Markdown, até ~400 blocos), criação de página em página ou banco (acha a propriedade de título). Aba `pages/Notion.tsx`; "Perguntar à IA" usa `useAIStore.pendingDraft` (amarrado à conversa, idempotente).
- **Demo web (portfólio)**: `npm run build:demo` gera `dist-demo/` com a interface REAL do renderer e `window.workspace` simulado (`src/demo/workspaceMock.ts`, tipado como `WorkspaceApi`: se um canal novo entrar no preload, o typecheck obriga a simular). Dados fictícios em sessionStorage. Publicar = copiar `dist-demo/` para `pq-portfolio/qrzspace-demo/`.
- **Patch notes**: `src/shared/changelog.ts` (pt/en). O teste exige que a versão do `package.json` seja a primeira entrada.
- **Atualizações**: publicadas em **PQueirozDev/QrzSpace-releases** (repositório público só com instaladores; este repositório de código é privado). `npm run release` gera o instalador e cria a release com o `gh` (patch notes do changelog em pt e en).

### Validado no Windows (2026-09-25)
- Instalador NSIS com `npmRebuild: false` (módulos nativos N-API com prebuilds).
- **E2E automatizado (`npm run e2e`, só Windows com display)**: `scripts/e2e/run.mjs` sobe `scripts/e2e/mock-server.mjs` (simula Anthropic, OpenAI, Gemini, GitHub, Spotify e Google OAuth/Calendar no formato real), o Vite e o Electron com perfil temporário e DevTools na porta 9223, e percorre pela UI: conectar as 6 integrações (OAuth com PKCE + loopback), chat com streaming, comando sugerido com diálogo de permissão e execução real, regenerar, interromper, anexo, Council com 3 providers + síntese, aba Uso, issues/PRs do GitHub, commit com confirmação, mini player do Spotify, eventos do Google na Agenda, CRUDs, terminal e a interface inteira em inglês. `E2E_SHOTS=<pasta>` salva screenshots; `E2E_KEEP=1` deixa o app aberto no fim. Precisa das portas 5173, 9223 e 43821 livres.
  - Desvio das APIs: `src/main/integrations/endpoints.ts` centraliza todas as URLs externas; `QRZ_TEST_API` só é aceito com `app.isPackaged === false` e para `http://127.0.0.1:<porta>`. Nesse modo o OAuth não abre o navegador e o Discord fica desligado.
- E2E via DevTools Protocol: 12+ páginas sem erros de console; os 5 temas; interface inteira em inglês sem texto em português; Discord com o app do Discord aberto (Client ID inválido → status "erro"); diálogo de novidades pós-atualização.
- Atualização automática de ponta a ponta com feed local (`QRZ_UPDATE_TEST_URL=http://127.0.0.1:<porta>/`, aceito só em localhost): app instalado 1.0.0 baixou, verificou, instalou e reabriu como 1.0.1. Instalador adulterado foi recusado (`sha512 checksum mismatch`).

### Falta (depende do usuário)
- Credenciais que ainda dependem do usuário: API key do Gemini (opcional) e OAuth do Google Agenda (Client ID/Secret do Google Cloud).
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
npm run build:demo   # demo web para o portfólio (dist-demo/)
npm run e2e          # E2E pela UI com APIs simuladas (Windows, abre uma janela do app)
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
- Erros do main com valores dinâmicos: `tt("Texto com {x}", { x })` de `src/main/i18n.ts` (traduz no idioma atual). Mensagens padrão do zod saem no idioma do app (`parse` em `security/validation.ts`).
- Texto novo na UI: sempre `tr("texto em português")` e a tradução em `src/shared/locales/en.ts`. Frases com nomes usam placeholders: `tr("Abrir {name}", { name })` — nunca concatenar pedaços.
- Contagens usam plural de verdade, nunca "(s)": `trn(n, "{n} tarefa", "{n} tarefas")` no renderer e `translatePlural(lang, n, ...)` no main (as duas formas são chaves no `en.ts`; o teste de i18n recusa "(s)").
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
