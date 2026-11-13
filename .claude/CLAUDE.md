# CLAUDE.md

Guia para o Claude Code continuar o **Qyrex**: um app desktop (Electron + React + TypeScript + SQLite) que funciona como central de trabalho de um desenvolvedor. Ele reúne projetos com git, terminal, automações, tarefas, arquivos, IA, agenda, Notion, Spotify e GitHub. O app **orquestra** os programas externos (VS Code, terminal, Explorer); a exceção é o editor de código embutido (aba Editor, 1.12.0), um editor leve para ajustes rápidos que não substitui o VS Code.

Sempre responda e comente o código em **português do Brasil**, com acentuação correta.

## Qyrex 2.2.0: processos, ferramentas e cara nova (branch `v2.2`, não publicada)

### Ajustes de continuidade (2026-11-13)

- **Site**: paleta Onsen original e seletor de seis temas com amostras, teclado e persistência. Fonte Inter local (licença em `site/assets/inter-LICENSE.txt`), cabeçalho flutuante, botões e cartões suaves, links em laranja no hover, hero em duas colunas. Artes mantêm cores e pontilhado suave; luz de pixels nos destaques. Capivara em botão de 44 px, balão só ao clicar. Todas as páginas creditam Pedro Queiroz no rodapé.
- **App**: Monitor abre como padrão e destaca CPU e memória do próprio Qyrex; Arquivos ganhou acesso rápido aos projetos, caminho completo e Pasta acima; três terminais usam três colunas sem célula vazia. `PageHeader` compartilha um brilho pontilhado sutil. A abertura acompanha o tema, dura menos (mínimo 1,7 s) e respeita movimento reduzido.
- **Capturas**: `npm run build:demo && npm run screenshots` gera PNG para o README e WebP para o site, em perfil separado com dados fictícios; inclui Workspace, Monitor, Arquivos e três terminais. A demo pública vem de `dist-demo/`, publicado na pasta `qyrex-demo/` do repositório `PQueirozDev/pq-portfolio`.
- **Desenvolvimento/E2E**: `QYREX_DEV_PORT` permite usar outra porta local sem encerrar projetos que ocupam a 5173. O E2E passa essa porta ao Vite e ao Electron; não altera a origem permitida para uma origem externa.

Pedido do usuário: deixar o app menos "simples" no visual e com mais ferramentas de dev. Sem migration nova.
- **Identidade**: o tema `dark` usa o laranja da marca (`--accent: 255 154 60`) e o `light` um laranja escuro (`194 87 12`); o azul ficou só no Meia-noite. `components/ui/Brand.tsx`: `Mascot` (capivara de `assets/logo-mark.svg`, escala inteira, animação `animate-bob` em degraus) e `DitherGlow` (brilho pontilhado Bayer 8×8 em canvas, a mesma linguagem do site, redesenha ao trocar de tema). `EmptyState` aceita `mascot`.
- **Início limpo** (`pages/Dashboard.tsx`): sem os cards de número; resumo do dia numa linha clicável, faixa "Continuar de onde parou" (último projeto aberto), widgets em `Widget` (sem sombra/ícone), projetos recentes em lista com ações no hover, botão **Daily**.
- **Layout**: barra de status (`components/StatusBar.tsx`: projeto atual, branch, ↑↓, alterações, processos, limites da IA e memória, que saíram do cabeçalho; música só com a sidebar recolhida). Sidebar recolhível (`useUIStore.sidebarCollapsed`, localStorage `qrz.sidebarCollapsed`).
- **Runner** (`services/runnerService.ts`, página `pages/ProcessesPage.tsx`, store `useRunnerStore`): scripts do package.json pelo comando FIXO `& $env:QYREX_RUN_PM run $env:QYREX_RUN_SCRIPT` (nome do script por variável de ambiente, conferido contra o package.json) ou comando livre como um único `-Command`. `runner:start` exige `confirmed`; `restart` repete o comando já confirmado guardado no main. Saída em lotes de 50 ms (`runner:data`), buffer de 256 KB, URLs locais detectadas, `stopAll` no `before-quit`. Portas: `netstat -ano` (escuta reconhecida pelo remoto `:0`, porque o estado vem traduzido) + `tasklist`; esconde sistema, faixa dinâmica e o próprio Qyrex; `killPort` confere de novo PID+porta e exige `confirmed`. `exec.ts` ganhou `spawnStreaming` e `killPid`.
- **Ferramentas** (`pages/ToolsPage.tsx` + funções puras em `lib/devtools.ts`, testadas): JSON (com localizador próprio do erro, `jsonErrorIndex`: o V8 novo não dá posição), JWT (sem verificar assinatura), Base64/URL, timestamp, regex, diff (LCS, até 2000 linhas), UUID, hash, cores (contraste WCAG), nomes/slug.
- **Projetos**: `services/projectInsightsService.ts` (`projects:insights`: linguagens por bytes com cores do Linguist, sem seguir links e com limites; commits por semana via `gitService.getWeeklyCommits`; último commit; cache de 5 min, limpo após commit/pull). Cards novos + visão em lista (`qrz.projectsView`). No drawer: seção Scripts (`components/runner/ProjectScripts.tsx`), CI do GitHub Actions (`overview.runs`, falha de Actions vira lista vazia) e `.env` (`services/envService.ts`, `projects:envCheck`: só NOMES de variáveis saem do main).
- **Assistentes de IA** (`services/assistService.ts`, `aiService.streamOneShot`, uso registrado como `source: "assist"`): `assist:commitMessage` (o main lê o diff dos arquivos marcados que existem de fato no `git status`, até 40 KB, e segue o estilo dos commits recentes) e `assist:daily` (seus commits via `user.email` com `--fixed-strings` + tarefas desde o último dia útil). Resposta pelo `ai:stream`; a UI só preenche campo/mostra texto (`lib/useAssist.ts`, `components/DailyDialog.tsx` carregado sob demanda).
- Novas páginas `processos` e `ferramentas` (sidebar, Discord, `PAGE_ICONS`). Demo simula runner, insights, `.env`, CI e assistentes.
- **Segunda leva (pedido "master prompt" do usuário), migration `019_workspace_plugins.sql`** (só cria `project_notes`, `quick_links`, `plugins`):
  - **Preview** (`services/previewService.ts`, `components/preview/PreviewPanel.tsx`, página `preview`): `WebContentsView` nativa por cima da área medida no renderer (`preview:setBounds`, laço de 120 ms só com a página visível; null esconde). Sessão `qyrex-preview` não persistente, sem preload, sandbox, permissões e downloads negados, só `isLocalPreviewUrl` (localhost/127.0.0.1/[::1]/*.localhost; sem credenciais na URL), externo vai para o navegador. A view fica por cima do DOM: diálogos (`role=dialog`) e overlays marcados com `data-overlay` (paleta, Menu, Drawer, notificações) fazem o preview se esconder. Na demo, um iframe `sandbox` faz o papel da view.
  - **Monitor** (`services/monitorService.ts`, `components/runner/MonitorView.tsx`, aba Monitor em Processos; `navigate("processos","monitor")`): `os.cpus`/memória, `app.getAppMetrics` e a árvore de cada processo do runner por um script PowerShell FIXO (`Get-CimInstance Win32_Process`), só quando a UI pede.
  - **Workspace** (`lib/workspaceLayout.ts` puro e testado, `stores/useWorkspaceStore.ts`, `components/workspace/*`, página `workspace` montada como `PersistentPage`): árvore de divisões com grupos de abas, cada painel uma vez por projeto, presets dev/debug/git/focus, arrastar aba para centro/borda, maximizar, redimensionar (mouse e setas). localStorage `qrz.ws.session` e `qrz.ws.layout.<id>`. Mover um painel de grupo remonta o conteúdo (o terminal reinicia). `TerminalView` e tipos são exportados de `TerminalPage.tsx`.
  - **Capivara** (`stores/useBuddyStore.ts`, `components/buddy/*`): humores animados em degraus sobre a arte original, acessórios em pixel art no código, eventos reais (tarefa concluída via `useTasksStore`, runner, foco), limite de balões (`few` = 3 min), dicas só no modo `all`. Perguntas rápidas respondidas localmente (`answers.ts`); `assist:buddy` exige `consent` (`requireConfirmation`) e manda só um resumo. Preferências em `qrz.buddy` (Configurações → Aparência). O painel carrega sob demanda.
  - **Plugins** (`services/pluginService.ts`, página `plugins`, `docs/PLUGINS.md`, exemplo em `docs/plugin-example/`): só manifesto JSON (`.strict()`, permissões obrigatórias por contribuição, caminhos de modelo relativos sem `..`), nada executa. Embutidos `qyrex.project-notes`, `qyrex.quick-links`, `qyrex.project-templates` (desligáveis, não removíveis). Instalação só pelo seletor nativo; atualização só com versão igual ou maior; compatibilidade pela versão do `CHANGELOG[0]`. Modelos criam pasta NOVA dentro de pasta autorizada (`flag: "wx"`), cadastram o projeto e as tarefas, com `confirmed`.
  - **Experiência**: sidebar em grupos (dia a dia, Desenvolvimento, Ferramentas, Sistema; "Ferramentas" virou "Utilitários"), widgets `servidores` e `avisos` no Início, central de notificações (histórico dos toasts da sessão em `useUIStore.notifications`), atalhos configuráveis (`lib/shortcuts.ts`, `qrz.shortcuts`, Configurações → Atalhos e densidade), modo compacto (`html.compact`, `qrz.compact`), paleta com workspace/preview/monitor/layouts/links.
  - **Site** (feito pelo Codex a pedido do usuário, só em `site/`): `index.html` novo + `download.html`, `docs.html`, `roadmap.html`, `changelog.html` (releases reais pela API do GitHub, com fallback), `common.js`, `releases.js`, `sitemap.xml`, `robots.txt`, `vercel.json` (`cleanUrls`). `site/verify.cjs` é o roteiro de QA (fora da publicação). Capturas novas em `site/assets/app-*.webp` geradas da demo.
  - Medido: bundle inicial do renderer 544,0 kB → 610,4 kB (172,7 → 195,8 kB gzip).
  - E2E inclui Preview (página sem `window.workspace`/`require`/`process`), Runner+Monitor e Workspace. Validação atual: **27/27 etapas**, incluindo três terminais sem área vazia e preservação de sessões ao navegar. `QYREX_DEV_PORT=5188` permite rodar sem ocupar a 5173 de outro projeto. Os seletores usam elementos visíveis e aguardam módulos carregados sob demanda.
  - Pendências conhecidas: menu de contexto (botão direito) nos cards; restaurar sessões de terminal; preview por projeto em abas simultâneas (a view nativa é uma só); saúde das dependências, cliente HTTP, Docker.
- Atenção ao editar com scripts: vários arquivos do repositório estão com CRLF no disco; substituições de várias linhas precisam normalizar as quebras antes (ou usar a ferramenta de edição).

## Qyrex 2.1.0: 100% para devs

A pedido do usuário saíram **Clientes, cobranças/manutenção mensal, Marketing e WhatsApp**, junto com o Modo Negócio (`businessMode`). Não recriar nada disso. Agenda, Notion e mídia/Spotify ficam.
- **Migration `018_dev_only.sql`**: apaga `clients` e `marketing_content`, reconstrói `projects` e `tasks` sem `client_id` e tira `business_mode`. A primeira linha `-- qyrex: foreign_keys off` faz o executor (`db.ts`) desligar as chaves estrangeiras fora da transação e rodar `foreign_key_check` antes de confirmar; use o mesmo marcador em qualquer migration que reconstrua tabela. Teste em `tests/database/migration-018.test.ts`.
- **Backup obrigatório antes de migration que apaga dados**: `DESTRUCTIVE_MIGRATIONS` em `src/main/index.ts`. Se o backup falhar, a migration não roda e o app mostra o erro e fecha.
- `getSettings()` e `parseSettingsExport` descartam widgets e avisos que não existem mais (ex.: `cobrancas`, `billing`), para configurações e exportações antigas continuarem válidas.
- `likePattern` mudou para `src/main/database/sql.ts`.
- `npm run check` passa (282 testes, 3 pulados) e o E2E passa 24/24. A demo (`workspaceMock.ts`) usa projetos de dev (api-pagamentos, dashboard-admin, bot-discord).
- Sugestões do Codex ainda não feitas, em ordem: workspace por projeto, restaurar sessão de terminais, runner de processos longos, PRs/CI no projeto, staging por trecho no Git. Riscos conhecidos: o snapshot de sincronização leva `projects.local_path` do outro PC; o foco conta a sessão inteira no dia em que começou.

## Estado anterior (v2.0.0, publicada em 2026-10-20)

`npm run check` passa (typecheck, lint sem warnings e 285 testes; 3 pulados). E2E: 24/26 (Notion e Terminal falham igual na 1.13.0 neste PC: instabilidade do ambiente, não regressão). A auditoria e o plano do 2.0 estão em `docs/AUDITORIA_QYREX.md`.

### Qyrex 2.0 (migrations 012–017; sincronização sem migration)
- **Backup** (`services/backupService.ts`, 012): `<userData>/backups/<id>/` com `workspace.sqlite` (VACUUM INTO, `journal_mode=DELETE`), `files/` (avatar, ícones) e `manifest.json` (migrations, tamanho, SHA-256). A pasta só ganha o nome final depois do `integrity_check`; poda só depois. Automático (prefs `backup`, padrão 1×/dia, guarda 10) e "antes de migrar" (`setBeforeMigrateHook` em `db.ts`, ligado no `index.ts`; `getDb` tem trava `opening` contra recursão). Restaurar: copia o backup para `.restore-<id>`, faz backup "pre-restore", `replaceDatabaseFile` migra a CÓPIA antes de trocar e volta o `.previous` se não abrir; recusado com automação rodando. Exportar/importar só as chaves `PORTABLE_KEYS` (sem pastas, sem segredos), aplicadas pelo `settings:update`.
- **Projetos** (013): `status` (ativo/pausado/concluido) e `archived_at`. Arquivado não consulta git, sai do Início/paleta/bandeja.
- **Git** (`gitService.ts`): status com `-z` + `core.quotepath=false` (nomes com espaço/acento), `GIT_LITERAL_PATHSPECS=1`, diff com `--no-ext-diff --no-textconv`, arquivo novo lido via allowlist. Commit dos arquivos marcados (`files`), branches (trocar é recusado com alterações rastreadas), fetch, `push -u origin <branch>` sem upstream (nunca `--force`), conflitos e merge/rebase em andamento. UI em `components/GitPanel.tsx`.
- **Foco** (`focusService.ts`, 014): relógio no main (`focus:changed`), checkpoint por minuto, `recoverOnStartup` volta pausada sem inventar tempo, `pauseOnQuit`. Cancelada não conta; nunca passa do planejado. Tempo vai para o dia em que a sessão começou (limitação conhecida). UI em `components/Focus.tsx` + `stores/useFocusStore.ts`.
- **Início** (015): widgets `DASHBOARD_WIDGETS` com ordem/ocultos em `settings.dashboard` (`components/DashboardCustomize.tsx`). Widget novo entra sozinho no fim.
- **Automações** (`automationService.ts`, 016): passos `command` (PowerShell via `commandService.executeConfirmed`) ou `open` (vscode/explorer/terminal). Sem agendamento; `automations:run` exige `confirmed`; risco recalculado no main a cada leitura; para no primeiro erro; 5 min por comando; cancelar mata a árvore (`killTree` em `exec.ts`). Histórico (30/automação, fim da saída). Página `pages/Automations.tsx`, diálogo `components/AutomationRun.tsx`.
- **Prompts** (`promptService.ts`, 017) + modelos fixos em `components/PromptLibrary.tsx`; inserir só preenche o campo.
- **Sincronização** (`syncService.ts`): pasta da nuvem (`<pasta>/Qyrex-sync/latest.json` + `snapshots/<rev>.qyx`), estado local em `<userData>/sync.json` (fora do banco). Cópia sem `LOCAL_TABLES`/`LOCAL_SETTINGS` + VACUUM, cifrada (AES-256-GCM, scrypt, senha no cofre como `sync_passphrase`). Estado por revisão + `contentHash` lógico; conflito só com escolha do usuário; receber exige `confirmed`, faz backup `pre-sync` e reaplica os dados locais. Nunca automático.
- **Só terminais**: `useUIStore.terminalOnly` (localStorage `qrz.terminalOnly`), vale só na página Terminal; a barra de abas vira barra de título (`drag-region titlebar-safe`).
- **Build**: `scripts/vite-monaco-workers.ts` (nos dois configs do Vite) remove as cópias de workers que o Monaco declarava e nunca eram usadas; falha o build se o formato do Monaco mudar.
- **Mini player**: o equalizador tem alturas fixas e `motion-reduce:animate-none` (a regra global de reduzir movimento achatava as barras).
- **Linux**: fora deste ciclo por decisão do usuário; não declarar suporte.
- **Abertura**: só o símbolo no centro (sem cartão) e, na saída, um círculo se abre a partir dele (máscara `--hole`); barrinha ligada ao carregamento real.
- Verificação visual: o E2E (`npm run e2e`) cobre os fluxos antigos; os novos foram conferidos com um roteiro CDP no mesmo molde (perfil temporário).

### Feito
- **Nome e marca (1.7.0)**: o app se chamava QrzSpace e virou **Qyrex** (open source, licença MIT). O `appId` continua `com.pedroqueiroz.qrzspace` de propósito (o instalador novo substitui o antigo e o atalho fixado continua valendo). A pasta de dados mudou com o nome: `src/main/legacyData.ts` copia `%APPDATA%/QrzSpace` para `%APPDATA%/Qyrex` na primeira abertura (nunca sobrescreve um banco existente; a pasta antiga fica como backup).
- **Pixel art**: `site/pixel/pixel.mjs` desenha em código a capivara com a laranja, a cena do onsen (vídeo do site, precisa do ffmpeg), a folha de sprites (`capy-sheet.png`) e o ícone 32×32 (`build/icon.svg` + `src/renderer/assets/logo.svg`). Depois de mudar o ícone, rode `npm run icons`. No topo do site, o nome (15cqw) e a capivara (40cqw) foram reduzidos a pedido do usuário; não voltar ao tamanho antigo. O logo da sidebar fica em 32 px com `image-rendering: pixelated` (tamanho inteiro, senão borra).
- **Site**: `site/` é estático (index.html, styles.css, app.js, assets/). No ar em https://qyrex.pqueirozdev.com.br (projeto `qyrex` na Vercel, time pqueirozdev; `qyrex.vercel.app` é de outra conta). O projeto está ligado ao GitHub com Root Directory `site`: cada push na main publica o site sozinho (sem build). Se o Root Directory sumir, a Vercel compila a raiz do repo e o site dá 404. Links do site dentro do app: `src/shared/links.ts` (Configurações → Sobre, Novidades e bandeja). Links do repositório/download ficam em `LINKS` no topo de `site/app.js`. O screenshot `site/assets/app-inicio.webp` sai da demo (`npm run build:demo`). Visual do site (2026-11): fundo preto, um só destaque (laranja), imagens pontilhadas em 1 bit desenhadas ao vivo em canvas por `app.js` (Bayer 8×8: o vídeo do onsen atrás do print do app e a paisagem do rodapé), cores lidas dos tokens (trocar de tema recolore). O site usa `assets/icon-pixel.svg` (cores originais); o `assets/icon.svg` em halftone preto NÃO deve ser usado, a pedido do usuário. Conteúdo 100% para devs: nada de clientes, cobranças ou marketing.
- `src/main/**`: ipc/handlers com validação zod e checagem de remetente, services, integrações (Claude via `@anthropic-ai/sdk`, OpenAI e Gemini via REST, GitHub com PAT, Spotify com PKCE, Google Calendar com OAuth loopback, Discord Rich Presence via named pipe), segurança (paths, commands, exec, secrets, validation), logger com redaction (inclusive cookies), notificações, terminal node-pty, tray, CSP e atualização automática (`services/updateService.ts`, electron-updater).
- `src/preload/index.ts`: API completa em `window.workspace` (fonte da verdade dos canais IPC).
- Renderer: todas as páginas, incluindo **Novidades** (`pages/PatchNotes.tsx`) e **Configurações** com seletor visual de temas, idioma, Discord e atualizações.
- **Temas**: `lib/themes.ts` (catálogo) + blocos `:root[data-theme="<id>"]` em `styles/index.css`. Temas: dark, light, midnight, violet, sand, onsen (+ system). "Onsen" usa as cores da marca (azul-noite e laranja #ff9a3c, iguais ao site). No seletor, "Sistema" ocupa a linha inteira para a grade fechar.
- **Idioma (i18n)**: textos em português são a chave; `src/shared/locales/en.ts` traduz. Renderer usa `tr()` de `@/lib/i18n`; main usa `translate(lang, ...)` de `shared/i18n`; textos que só são traduzidos depois (enviados por variável) são marcados com `tm()`. O teste `tests/i18n.test.ts` falha se faltar tradução, se sobrar chave morta ou se placeholders `{x}` não baterem. `node scripts/i18n-keys.cjs --missing` lista o que falta.
- **Uso da IA**: `services/usageService.ts` registra tokens (só contadores) em `ai_usage` a cada `runStream`; providers informam via `onUsage`. Custo estimado só para modelos com preço conhecido (tabela Anthropic em `PRICES`). Aba "Uso" em `components/AIUsageView.tsx`.
- **IA pela assinatura**: `integrations/cli/subscriptions.ts` roda o Claude Code (`claude -p`, stream-json) e o Codex (`codex exec --json`) já logados no PC, com TODAS as ferramentas desligadas, cwd vazio e sessão efêmera. `aiService` usa isso quando `integrations.metadata.authMode === "subscription"` (Claude → claude, OpenAI → codex). Uso registrado como `claude-code/<modelo>` / `codex/<modelo>` (sem custo).
- **GitHub pelo gh**: `github.connectWithGhCli()` lê `gh auth token` direto para o cofre.
- **Mini player** (`components/MiniPlayer.tsx`): lê a mídia do Windows (GSMTC) por um PowerShell persistente com script fixo embutido (`integrations/media/mediaScript.ts`), comandos de lista fechada. Capa buscada por nome na Deezer/iTunes e entregue como data URL. A Web API do Spotify virou opcional.
- **Visual (1.6.0)**: `lib/pageIcons.ts` (`PAGE_ICONS`, ícone único por área: sidebar e `PageHeader icon`), `Avatar` (cor estável por nome, classe `.avatar`), `.surface` (véu de luz nos cards escuros), `.skeleton` (carregamento com brilho), checkbox e `select.input` estilizados no CSS global (não use `accent-*` nem seta nativa), pílula ativa com `layoutId` na sidebar/Configurações, kanbans com destaque de coluna ao arrastar.
- **HUD**: biblioteca `motion` (layout/spring). Barra de título nativa escondida (`titleBarOverlay`, cores sincronizadas com o tema via `system:setTitleBarColors`); `.drag-region`/`.no-drag`/`.titlebar-safe`, `.press`, `.shine`, `AnimatedValue`, `Segmented` com pílula deslizante.
- **Ícone**: fonte em `build/icon.svg` (cópia em `src/renderer/assets/logo.svg` para a barra lateral). `npm run icons` rasteriza pelo Electron e gera `build/icon.png` + `build/icon.ico` (PNG embutido) e as artes do instalador (`installerSidebar.bmp`, `uninstallerSidebar.bmp`, `installerHeader.bmp`, via `scripts/icons/installer.cjs`). A atividade do Discord usa `icon.png` do repositório público QrzSpace-releases.
- **Foto de perfil (1.8.0)**: `services/profileService.ts`. A imagem vem SEMPRE do seletor nativo (`profile:pickAvatar`, o renderer nunca manda caminho), é recortada no quadrado central (`centerSquare`), reduzida para 256 px e salva em `<userData>/avatar.png`; vai para a UI como data URL. Estado em `useSettingsStore.avatar`; componente `components/ProfileAvatar.tsx` (foto ou, por padrão (1.9.0), o ícone do Qyrex; "Usar ícone padrão" remove a foto) na sidebar, no Início, em Configurações → Geral e no onboarding. Na demo, `<input type=file>` + canvas, só na sessão.
- **Animação de abertura (1.9.0)**: `components/SplashScreen.tsx`, montado em `main.tsx` por cima do App (capivara com mola lenta, nome letra a letra, barrinha de carregamento, sai com blur + fade quando as configurações carregam; mínimo 2,6 s + 0,6 s de saída, o usuário pediu mais demorada). Preferência `splashAnimation` (migration 007, Configurações → Aparência), espelhada no localStorage (`qrz.splash`) para decidir antes do IPC. De propósito NÃO obedece o "reduzir movimento" do Windows: o PC do usuário está com ele ligado e a animação nunca apareceria.
- **Tempo de uso do app (1.9.0)**: `services/appUsageService.ts` + tabela `app_usage` (migration 008, um registro por dia local). Soma 30 s por ciclo só com a janela visível, não minimizada e o PC não ocioso (`powerMonitor`, 5 min). Canal `appUsage:summary`. UI em `components/AppUsage.tsx`: botão "Hoje" no cabeçalho do Início e diálogo com dias usados, média, sequência, últimos 7 dias e mapa de 6 meses.
- **Download direto no site (1.9.0)**: `scripts/release.mjs` publica também `Qyrex-Setup.exe` (nome fixo); o botão do site aponta para `releases/latest/download/Qyrex-Setup.exe`. Navegador nenhum instala sozinho: o clique baixa, o usuário abre.
- **Notion**: `integrations/notion.ts` (token de integração interna no cofre, `Notion-Version: 2022-06-28`, URL em `endpoints.notion()`). Busca, leitura (blocos → Markdown, até ~400 blocos), criação de página em página ou banco (acha a propriedade de título). Aba `pages/Notion.tsx`; "Perguntar à IA" usa `useAIStore.pendingDraft` (amarrado à conversa, idempotente).
- **Editor embutido (1.12.0)**: aba `pages/EditorPage.tsx` com Monaco (`monaco-editor`, sem CDN), configurado em `lib/monaco.ts`. Os workers são `?worker&inline` (blob) importados sob demanda, porque em `file://` o Chromium não cria worker a partir de arquivo; por isso a CSP tem `worker-src 'self' blob:` (em `vite.config.ts` e `src/main/index.ts`). Checagem semântica do TS desligada (sem o projeto inteiro só daria falso erro). Canais `files:readForEdit` (até 5 MB, UTF-8 estrito, detecta BOM/EOL), `files:save` (grava no lugar; devolve `conflict` se o mtime mudou, `force` só pula essa checagem) e `files:createFile`. A página fica montada escondida como o Terminal (`PersistentPage` no App) e guarda a sessão em `localStorage` (`qrz.editor`), inclusive o texto não salvo, que volta como pendente. Atalhos globais ignoram teclas com `defaultPrevented` (o Monaco tem prioridade). Entradas: sidebar, Projetos, Arquivos (menu e pré-visualização) e Command Palette, via `navigate("editor", caminho)`.
- **Ícone dos projetos**: `services/projectIconService.ts` + coluna `projects.icon_mode` (migration 011: `auto` | `custom` | `none`). No `auto`, procura o ícone/logo do app na pasta (package.json `build.icon`, app.json do Expo, lista `KNOWN_ICON_FILES` e varredura rasa por icon/logo/favicon), sempre conferindo que o caminho real (symlink/junction) continua dentro da pasta; se o melhor candidato não abrir, tenta o próximo. Vai como data URL de até 96 px (cache por arquivo+mtime). `custom` vem só do seletor nativo (`projects:pickIcon`) e fica em `<userData>/project-icons/<id>.png`. UI: `ProjectIcon` (primitives; cai nas iniciais) nos cards, Início e drawer; trocar em Editar projeto.
- **Demo web (portfólio)**: `npm run build:demo` gera `dist-demo/` com a interface REAL do renderer e `window.workspace` simulado (`src/demo/workspaceMock.ts`, tipado como `WorkspaceApi`: se um canal novo entrar no preload, o typecheck obriga a simular). Dados fictícios em sessionStorage. Publicar = copiar `dist-demo/` para `pq-portfolio/qyrex-demo/` (o antigo `/qrzspace-demo/` redireciona).
- **Repositório e README**: o README mostra telas reais em `docs/screenshots/`, geradas da demo por `npm run build:demo && npm run screenshots` (`scripts/screenshots.cjs`: abre a demo numa janela invisível, clica pela sidebar e captura 1440×900; `instalador.png` é print do assistente NSIS). Refaça os prints quando a interface mudar. Este guia fica em `.claude/CLAUDE.md` para não poluir a raiz. Modelos de issue em `.github/ISSUE_TEMPLATE/`.
- **Patch notes**: `src/shared/changelog.ts` (pt/en). O teste exige que a versão do `package.json` seja a primeira entrada.
- **Atualizações**: publicadas em **PQueirozDev/QrzSpace-releases** (repositório público com os instaladores; o feed de atualização dos apps já instalados aponta para ele). `npm run release` gera o instalador e cria a release com o `gh` (patch notes do changelog em pt e en).

### Validado no Windows (2026-09-25)
- Instalador NSIS com `npmRebuild: false` (módulos nativos N-API com prebuilds). Visual (1.9.x): assistente com boas-vindas, licença MIT, arte lateral/cabeçalho da marca e textos em pt-BR/inglês conforme o idioma do Windows (`build/installer.nsh`, `installerLanguages`). Boas-vindas e licença são puladas nas atualizações automáticas.
- **E2E automatizado (`npm run e2e`, só Windows com display)**: `scripts/e2e/run.mjs` sobe `scripts/e2e/mock-server.mjs` (simula Anthropic, OpenAI, Gemini, GitHub, Spotify e Google OAuth/Calendar no formato real), o Vite e o Electron com perfil temporário e DevTools na porta 9223, e percorre pela UI: conectar as 6 integrações (OAuth com PKCE + loopback), chat com streaming, comando sugerido com diálogo de permissão e execução real, regenerar, interromper, anexo, Council com 3 providers + síntese, aba Uso, issues/PRs do GitHub, commit com confirmação, mini player do Spotify, eventos do Google na Agenda, CRUDs, terminal e a interface inteira em inglês. `E2E_SHOTS=<pasta>` salva screenshots; `E2E_KEEP=1` deixa o app aberto no fim. Precisa das portas 5173, 9223 e 43821 livres.
  - Desvio das APIs: `src/main/integrations/endpoints.ts` centraliza todas as URLs externas; `QYREX_TEST_API` só é aceito com `app.isPackaged === false` e para `http://127.0.0.1:<porta>`. Nesse modo o OAuth não abre o navegador e o Discord fica desligado.
- E2E via DevTools Protocol: 12+ páginas sem erros de console; os 5 temas; interface inteira em inglês sem texto em português; Discord com o app do Discord aberto (Client ID inválido → status "erro"); diálogo de novidades pós-atualização.
- Atualização automática de ponta a ponta com feed local (`QYREX_UPDATE_TEST_URL=http://127.0.0.1:<porta>/`, aceito só em localhost): app instalado 1.0.0 baixou, verificou, instalou e reabriu como 1.0.1. Instalador adulterado foi recusado (`sha512 checksum mismatch`).

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
npm run screenshots  # refaz docs/screenshots/ a partir da demo (rode build:demo antes)
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
- Todo acesso a arquivo passa por `assertPathAllowed*` (allowlist do usuário, resolve `..` e symlinks/junctions). Raiz de disco, pastas do sistema e a home inteira não podem ser autorizadas na lista. A exceção é a opção "Permitir todas as pastas do PC" (`allowAllDirs`, migration 009, desligada por padrão e ligada só com confirmação): com ela, `getAllowedDirs()` devolve as unidades (`listDriveRoots()`), a pedido do usuário.
- Processos externos só via `security/exec.ts` (`spawn` com array, `shell:false`; `.cmd/.bat` são proibidos). **Nunca** concatene input do usuário num comando. O VS Code é aberto pelo `Code.exe` real (`detectVSCode`), não pelo `code.cmd`.
- Ações sensíveis (excluir/mover arquivo, commit/pull/push, rodar comando) exigem `confirmed: true`, enviado só depois do diálogo da UI.
- A IA **nunca** executa nada sozinha: não há tool-calling com execução. Comandos `dangerous` nunca podem ser "Permitir sempre". Push nunca é automático e nunca é `--force`.
- Segredos só em `security/secrets.ts` (safeStorage/DPAPI). Nunca no SQLite, no renderer ou nos logs. Na UI, só key mascarada.
- URLs externas passam por `isProtocolAllowed` (http, https, mailto, tel). Arquivos executáveis nunca são "abertos", só revelados no Explorer.
- AI Council: nunca disparar mais providers do que o usuário confirmou (`confirmedCount`).
- Automações nunca são agendadas nem disparadas sem clique + `confirmed: true`; "Permitir sempre" do chat não vale para elas.
- Backup nunca inclui segredos; restauração sempre cria antes um backup "pre-restore".
- WhatsApp: apenas links oficiais (`wa.me` / `whatsapp://`). Nada de bibliotecas não oficiais.

## Convenções

- TypeScript strict, sem `any` (o lint falha com warnings). Nada de botões que não fazem nada, dados mockados ou TODO fingindo implementação.
- Datas: use `lib/format.ts` (horário local). Não use `toISOString().slice(0,10)` para "hoje".
- Não use `window.prompt`/`window.confirm` (não funcionam no Electron). Use `promptText`/`confirmAction`.
- Visual: dark premium e minimalista (Linear/Raycast/Vercel). Use tokens `bg`, `bg-elevated`, `bg-card`, `bg-hover`, `border(-subtle)`, `text(-muted|-faint)`, `accent`, `danger/success/warning`, as classes `.input`, `.label`, `.section-title` e as animações `animate-pop-in`/`fade-in`/`slide-in`.
- Modelos Claude: padrão `claude-opus-5`. Lista viva via `models.list` e fallback em `providers/anthropic.ts`.
- Commits pequenos por etapa. Rode `npm run check` antes de cada commit. Autor: `Pedro Queiroz <pedrohenriqueiroz158@gmail.com>`, sem `Co-Authored-By` de IA (pedido do usuário).
