<p align="center"><img src="site/assets/qyrex-onsen-poster.png" width="720" alt="Pixel art do Qyrex: capivara com uma laranja na cabeça num onsen à noite, com um notebook numa bandeja"></p>

# Qyrex

Central de trabalho desktop open source: um app Electron para Windows que
reúne projetos, tarefas, arquivos, IA, clientes, marketing, agenda e
integrações num lugar só. Ele **orquestra** VS Code, terminal, Explorer,
WhatsApp e Spotify, sem tentar substituir nenhum deles.

**Site:** [qyrexapp.vercel.app](https://qyrexapp.vercel.app) (código em [site/](site/), com a pixel art e o vídeo da capivara).

**Download:** o instalador para Windows fica nas
[releases](https://github.com/PQueirozDev/QrzSpace-releases/releases/latest).
Depois de instalado, o app se atualiza sozinho.

> O app se chamava **QrzSpace** até a 1.6.2. Na primeira abertura da 1.7.0, os
> dados de `%APPDATA%/QrzSpace` são copiados para `%APPDATA%/Qyrex`.

## Funcionalidades

- **Início**: saudação, tarefas em foco, compromissos do dia, cobranças da
  semana, projetos recentes, commits recentes e ações rápidas.
- **Projetos**: cards com favoritos, tecnologias detectadas pelo `package.json`
  e status git. Abre no VS Code, no terminal, no Explorer ou no GitHub. O
  painel de detalhes mostra alterações, commits recentes, commit/pull/push
  (sempre com confirmação, push nunca com `--force`), issues e PRs do GitHub e
  as tarefas do projeto.
- **Terminal**: terminal integrado (xterm.js + node-pty) com abas, PowerShell
  ou CMD, aberto na pasta de um projeto ou de um diretório autorizado. Se o
  terminal integrado não estiver disponível, abre um terminal externo.
- **Arquivos**: navegação só dentro das pastas autorizadas, busca por nome,
  nova pasta, renomear, copiar, mover e excluir (com confirmação), copiar
  caminho, abrir no Explorer ou no VS Code e preview de imagem, código (com
  destaque de sintaxe) e Markdown.
- **Agenda**: visões de dia, semana e mês, com eventos locais e do Google
  Agenda (esses em modo somente leitura).
- **Tarefas**: lista (Hoje / Próximas / Todas / Concluídas) ou kanban, com
  prioridade, prazo, horário, tags, projeto e cliente. `Ctrl+Shift+T` cria uma
  tarefa de qualquer lugar.
- **Clientes**: status (ativo, prospecto, inativo), manutenção mensal, próxima
  cobrança, pasta de arquivos, projetos, tarefas e conteúdos vinculados, e
  atalhos para WhatsApp, Instagram, email e telefone.
- **Marketing**: quadro Ideia → Produzindo → Pronto → Publicado (arrastar e
  soltar), calendário semanal, captura rápida de ideias e posts, stories e
  reels com legenda, data e arquivos relacionados.
- **WhatsApp**: abre o app desktop ou o WhatsApp Web, conversas com clientes e
  números avulsos, com mensagem inicial opcional. Usa só links oficiais.
- **IA**:
  - Chat com Claude, OpenAI e Gemini, com streaming, interromper, regenerar,
    troca de modelo e histórico salvo.
  - Anexo explícito de arquivos do projeto: você vê exatamente o que será
    enviado.
  - Blocos de comando (PowerShell/bash/cmd) nas respostas têm o botão
    **Executar**. Ele avalia o risco e pede sua permissão (uma vez ou sempre).
    Comandos perigosos só aceitam confirmação pontual.
  - **AI Council**: a mesma pergunta para vários modelos, respostas lado a
    lado e uma síntese final. Antes de enviar, o app mostra quantos providers
    vão ser usados.
- **Integrações**: Claude, OpenAI, Gemini, GitHub, Google Agenda, Spotify
  (mini player na barra lateral) e WhatsApp, com status, testar e desconectar.
- **Command Palette** (`Ctrl+K`) com busca fuzzy, busca global no topo,
  bandeja do sistema e notificações desktop.
- **Temas**: Escuro, Claro, Meia-noite, Violeta, Areia ou Sistema, escolhidos
  por prévia em **Configurações → Aparência**.
- **Idioma**: português ou inglês (interface, notificações, menu da bandeja e
  respostas da IA).
- **Discord Rich Presence** (opcional): mostra no seu perfil do Discord a área
  do Qyrex em uso. O nome do projeto só aparece se você ligar essa opção.
- **Atualização automática**: ao abrir, o app procura, baixa, confere o SHA-512
  e instala novas versões, com contagem para reiniciar e opção de adiar. Pode
  ser desligada em Configurações.
- **Novidades**: aba com as patch notes de cada versão e um resumo mostrado uma
  vez depois de cada atualização.

Atalhos: `Ctrl+K` palette · `Ctrl+Shift+T` nova tarefa · `Ctrl+Shift+P`
projetos · `Ctrl+Shift+A` IA.

## Tecnologias

Electron · React 18 · TypeScript (strict) · Vite · Tailwind CSS · Zustand ·
better-sqlite3 · zod · xterm.js + @lydell/node-pty · react-markdown +
rehype-highlight · @anthropic-ai/sdk · electron-updater · Inter · Vitest

## Instalação (desenvolvimento)

Pré-requisito: Node.js 20+ no Windows. `better-sqlite3` e `@lydell/node-pty`
vêm com binários prontos, então não é preciso instalar o Visual Studio Build
Tools.

```bash
npm install
npm run dev:app      # compila o main e sobe Vite (5173) + Electron com hot reload
```

Se o binário do Electron não for baixado no `npm install`, rode
`node node_modules/electron/install.js`.

Comandos úteis:

```bash
npm run typecheck    # tsconfig.main.json + tsconfig.renderer.json
npm run lint         # eslint, sem nenhum warning permitido
npm test             # vitest rodando dentro do Electron (mesmo ABI dos módulos nativos)
npm run check        # typecheck + lint + test
npm run icons        # regenera build/icon.png e build/icon.ico a partir de build/icon.svg
node site/pixel/pixel.mjs   # redesenha a pixel art: ícone, sprites e vídeo do site (precisa do ffmpeg)
```

## Build e instalador

```bash
npm run dist         # gera release/Qyrex-Setup-<versão>.exe
```

O instalador NSIS (x64) é gerado pelo `electron-builder` (config em
`electron-builder.json`). Ele deixa escolher a pasta de instalação, cria
atalhos na área de trabalho e no menu Iniciar e inclui o desinstalador. O build
precisa rodar **no Windows**.

### Publicar uma nova versão (atualização automática)

1. Suba a versão no `package.json` (ex.: `1.0.1`) e adicione a entrada em
   `src/shared/changelog.ts` (pt e en). O teste falha se o changelog não
   tiver a versão atual.
2. `npm run release`: roda `check`, gera o instalador e publica a release
   `v<versão>` em **PQueirozDev/QrzSpace-releases** com o `gh`, usando as patch notes do changelog.

Os apps instalados encontram a versão nova ao abrir, baixam, conferem o
SHA-512 do `latest.yml` e instalam. Um download adulterado é descartado.
Nunca há downgrade nem pré-release.

## Configuração inicial

Na primeira execução, o onboarding pede seu nome e as pastas onde ficam seus
projetos (ex.: `C:\Projetos`). O Qyrex **só** lê, lista ou altera arquivos
dentro dessas pastas. Você gerencia a lista em **Configurações → Pastas
autorizadas**.

## Integrações

Tudo fica em **Integrações**. Cada chave ou token é guardado cifrado no cofre
do sistema e aparece na tela só mascarado.

| Integração | O que você precisa |
| --- | --- |
| Claude (Anthropic) | API key de [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| OpenAI | API key de [platform.openai.com](https://platform.openai.com/api-keys) |
| Gemini (Google) | API key do [Google AI Studio](https://aistudio.google.com/app/apikey) |
| GitHub | Fine-grained personal access token com leitura de Metadata, Issues e Pull requests |
| Google Agenda | No Google Cloud Console: ative a Google Calendar API e crie um OAuth Client do tipo **App para computador**. Informe o Client ID e o Client Secret. |
| Spotify | No [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), crie um app com o Redirect URI `http://127.0.0.1:43821/callback`. Só o Client ID é necessário (PKCE). |
| WhatsApp | Nada: usa os links oficiais (`wa.me` e o app desktop). |
| Discord (em Configurações) | Em [discord.com/developers](https://discord.com/developers/applications), crie um aplicativo chamado **Qyrex**, envie `build/icon.png` em Rich Presence → Art Assets com o nome `qyrex` e cole o Application ID. Precisa do app do Discord aberto no PC. |

## Segurança

- Janela com `contextIsolation: true`, `nodeIntegration: false` e
  `sandbox: true`. O renderer só fala com o main process pela API exposta em
  `window.workspace` (`src/preload/index.ts`).
- Todo canal IPC confere a origem da chamada, valida a entrada com zod e
  devolve `IpcResult`, sem vazar stack trace.
- Todo acesso a arquivo passa pela allowlist de diretórios autorizados, com
  resolução de `..`, symlinks e junctions. Raiz de disco, pastas do sistema e
  a pasta do usuário inteira não podem ser autorizadas.
- Processos externos rodam via `spawn` com argumentos em array e
  `shell: false`. Input do usuário nunca é concatenado num comando.
- Ações sensíveis (excluir ou mover arquivo, commit/pull/push, executar
  comando) só acontecem depois de um diálogo de confirmação.
- A IA nunca executa nada sozinha. Comandos sugeridos só rodam depois da sua
  permissão, e comandos perigosos nunca podem ser "permitidos sempre".
- API keys e tokens ficam só no cofre do sistema (`safeStorage`/DPAPI). Nunca
  vão para o SQLite, para o renderer ou para os logs, que têm redação
  automática.
- CSP restritiva e links externos limitados a http, https, mailto e tel.
  Executáveis nunca são abertos, só mostrados no Explorer.
- AI Council: nunca dispara para mais providers do que você confirmou.
- WhatsApp: nenhuma biblioteca não oficial.
- Atualizações: origem fixa no app (GitHub Releases via HTTPS), integridade
  por SHA-512, sem downgrade. Os logs do atualizador guardam só a primeira
  linha dos erros, e cookies também são redigidos.
- Discord: comunicação só com o app do Discord local (named pipe). Nomes de
  projeto ficam ocultos por padrão.

## Estrutura

```
src/
  main/          # processo Electron: ipc, services, integrations, security, database
  preload/       # única ponte exposta ao renderer via contextBridge
  renderer/      # React (pages, components, stores, lib)
  shared/        # tipos compartilhados (contrato main ↔ renderer)
tests/           # vitest: segurança, banco, IPC, arquivos e integrações
scripts/         # testes dentro do Electron, cópia das migrations e geração de ícones
build/           # ícones do app e do instalador
site/            # site estático (index.html, styles.css, app.js) e assets
site/pixel/      # pixel art desenhada em código: capivara, cena do onsen, ícone
```

## Roadmap

- ✅ Fundação: projetos, tarefas, arquivos, palette, SQLite, bandeja
- ✅ Central de IA: Claude / OpenAI / Gemini, anexos explícitos, execução de
  comandos com permissão
- ✅ Clientes, Marketing e Agenda com Google Agenda (leitura)
- ✅ Terminal integrado, GitHub, Spotify, WhatsApp (links oficiais),
  notificações
- ✅ AI Council com síntese
- ✅ 1.0 (ainda como QrzSpace): temas, idioma PT/EN, Discord Rich Presence, atualização
  automática e patch notes
- ✅ 1.7: nome novo (Qyrex), ícone em pixel art e código aberto
- ⏳ WhatsApp Cloud API oficial (lembretes de cobrança e confirmações)
- ⏳ Criar e editar eventos no Google Agenda direto pelo app
- ⏳ Automações entre módulos (ex.: tarefa ao publicar conteúdo, lembrete de
  cobrança)

## Pixel art

Toda a arte é desenhada em código, pixel a pixel, em `site/pixel/pixel.mjs`: a
capivara (com a laranja na cabeça), a cena do onsen noturno do vídeo do site
(96 quadros a 12 fps, recortados e ampliados 5× sem suavização) e o ícone
32×32 do app. Para mudar algo, edite o script
e rode `node site/pixel/pixel.mjs` e depois `npm run icons`.

## Contribuir

Issues e pull requests são bem-vindos. Antes de abrir um PR, rode
`npm run check`. Textos novos na interface usam `tr()` com a tradução em
`src/shared/locales/en.ts` (o teste de i18n confere). As regras de segurança do
`CLAUDE.md` valem para qualquer contribuição.

## Licença

[MIT](LICENSE) © Pedro Queiroz
