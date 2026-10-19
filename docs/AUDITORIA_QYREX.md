# Auditoria do Qyrex (v1.13.0 → 2.0)

Data: 2026-10-18. Base auditada: `main` em `ab75b23` (árvore limpa).

## 1. Estado de partida (medido, não estimado)

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | passa |
| `npm run lint` (`--max-warnings 0`) | passa |
| `npm test` | 234 testes passam, 3 pulados (caminhos do Windows fora do Windows — aqui estamos no Windows, os 3 são de outra plataforma) |
| `npm audit` | 2 vulnerabilidades **baixas**: `dompurify` dentro do `monaco-editor@0.57.0` (modo `IN_PLACE`, que o Monaco não usa com conteúdo externo). A correção sugerida rebaixa o Monaco para 0.56 (quebra). Decisão: manter e reavaliar quando sair um Monaco corrigido. |

## 2. Arquitetura atual

- **Electron 44** com três camadas bem separadas:
  - `src/main/` (Node): `ipc/handlers.ts` (todos os canais, ~150), `services/` (regras de negócio sobre SQLite), `integrations/` (IA, GitHub, Spotify, Google, Notion, Discord, mídia do Windows), `security/` (paths, commands, exec, secrets, validation), `database/` (migrations versionadas 001–011).
  - `src/preload/index.ts`: única ponte, `contextBridge.exposeInMainWorld("workspace", api)`.
  - `src/renderer/`: React 18 + Tailwind + zustand, navegação sem router (`useUIStore.navigate`), páginas carregadas sob demanda (`React.lazy`).
- **SQLite** via `better-sqlite3@13` (WAL, `foreign_keys = ON`), banco em `<userData>/workspace.sqlite`.
- **Terminal** com `@lydell/node-pty`; **editor** com Monaco embutido (sem CDN).
- **i18n** pt/en com teste que barra chave faltando/sobrando.
- **Demo web** (`src/demo/workspaceMock.ts`) tipada contra a API real: canal novo no preload obriga a simulação a acompanhar.

A arquitetura está saudável. **Não há motivo para refatoração estrutural**; o trabalho é preencher lacunas seguindo os mesmos padrões (service → zod → handler → preload → tipos → teste).

## 3. Segurança (Electron e operações locais)

O que já está correto e deve ser preservado:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`; webviews bloqueadas; `will-navigate` e `setWindowOpenHandler` mandam tudo para fora do app passando por `isProtocolAllowed`.
- CSP estrita em produção (meta no HTML **e** cabeçalho), sem `unsafe-eval`; permissões do navegador negadas exceto escrita na área de transferência.
- Todo IPC: checagem de remetente (`file://` ou o servidor de dev) → zod (chaves desconhecidas descartadas) → service. Erros voltam como `IpcResult`, sem stack trace.
- Arquivos: `assertPathAllowed*` resolve `..`, symlinks e junctions contra a allowlist; raiz de disco e home inteira não podem ser autorizadas.
- Processos: `security/exec.ts` só usa `spawn` com array e `shell:false`; `.cmd/.bat` recusados (CVE-2024-27980).
- Comandos sugeridos pela IA: `assessCommand` classifica o risco; `dangerous` nunca vira "Permitir sempre"; execução só com `confirmed: true`.
- Segredos só no cofre do SO (`safeStorage`), logger com redaction.

Riscos encontrados (nenhum crítico):

| # | Risco | Gravidade | Ação |
|---|---|---|---|
| S1 | `dompurify` do Monaco (ver acima) | baixa | acompanhar |
| S2 | Não existe backup: corrupção do `workspace.sqlite` ou uma migration ruim perde tudo | **alta para os dados** | Fase 2: backup/restauração |
| S3 | `git` só tem commit/pull/push; não há como **ver o diff** antes do commit, então o usuário confirma às cegas um `git add --all` | média | Fase 5: diff visual + escolha de arquivos |
| S4 | Automações não existem; se forem criadas, precisam reusar `assessCommand` + confirmação (não abrir um segundo caminho de execução) | — | regra de projeto para a Fase 5 |

## 4. Funcionalidades: existentes, parciais, ausentes

| Área do pedido | Situação | Observação |
|---|---|---|
| Interface (tema escuro, sidebar, atalhos, toasts, skeletons, Command Palette, capivara) | **existe** | 7 temas, `motion`, paleta de comandos. Ajustes pontuais, não redesign. |
| Projetos: nome, descrição, caminho, tecnologias, Git/branch, favorito, ícone, abrir no VS Code/terminal/Explorer | **existe** | |
| Projetos: **status**, **arquivar** | **ausente** | |
| Projetos: remoção não apaga a pasta | **existe** (`deleteProject` só remove o cadastro) | já há confirmação |
| Projetos: tarefas, sessões de foco e atividade **por projeto** no painel | parcial | tarefas têm `project_id`; falta resumo no drawer |
| IA: conversas por projeto, anexos, histórico, Council, uso de tokens, assinatura (Claude Code/Codex) | **existe** | `ai_conversations.project_id` já existe |
| IA: **prompts reutilizáveis** | **ausente** | |
| Automações | **ausente** | |
| Dashboard: widgets reais (agenda, tarefas, atividade, projetos recentes, cobranças) | **existe** | |
| Dashboard: **ocultar/reordenar widgets** | **ausente** | |
| Terminal integrado (abas, agentes, grade), editor embutido, arquivos | **existe** | |
| Git: branch, alterados, histórico, commit, pull `--ff-only`, push sem `--force` | **existe** | |
| Git: **diff**, **branches (listar/criar/trocar)**, **conflitos** | **ausente** | |
| Focus Mode | **ausente** | `app_usage` mede só tempo de app aberto |
| Backup / restauração / exportar configurações | **ausente** | |
| Sincronização entre PCs | **ausente** | **não será feito** nesta etapa: exige estratégia de conflitos e autenticação (regra do próprio pedido) |
| Linux | parcial | código tem ramos `process.platform`, terminal e mídia são só Windows. **Não testado**: não declarar suporte. |
| Site (`site/`) | existe | revisar textos depois das novas funções |

## 5. Desempenho

| # | Gargalo | Evidência | Ação |
|---|---|---|---|
| P1 | `projects:list` roda **2 processos `git` por projeto** a cada carregamento (status + remote) | `listProjectsWithGit` | aceitável até dezenas de projetos; projetos arquivados deixam de ser consultados (Fase 4) |
| P2 | Build do renderer com **workers do Monaco duplicados** (`ts.worker` 7 MB + 9 MB, `css.worker` ×2) | `dist/renderer/assets` = 28 MB | só pesa no instalador (são carregados sob demanda); investigar na Fase 7 |
| P3 | Página do editor (4 MB) | lazy, só carrega ao abrir | ok |

Não há serviços em segundo plano desnecessários: notificações (timer), contagem de uso (30 s) e o PowerShell do mini player (só com o player aberto).

## 6. Dependências

Nenhuma dependência claramente desnecessária. `highlight.js` + `rehype-highlight` (Markdown da IA) e o Monaco cobrem casos diferentes. Nenhuma lib nova será adicionada para os recursos abaixo: timer, backup (API `backup()` do better-sqlite3) e diff (saída do próprio `git`) não precisam.

## 7. Plano de implementação (ordem ajustada pela auditoria)

O backup vem **antes** de tudo porque as fases seguintes adicionam migrations: o usuário precisa conseguir voltar atrás.

1. **Backup e restauração** — `services/backupService.ts`: `db.backup()` online (consistente com WAL), manifesto com versão/migrations/hash SHA-256, `PRAGMA integrity_check` no arquivo gerado antes de considerá-lo válido, restauração só com confirmação e com backup automático do estado atual antes; backup automático configurável; exportar/importar configurações (sem segredos).
2. **Projetos**: status (`ativo`/`pausado`/`concluido`) e arquivamento (migration nova); arquivados fora das consultas de Git.
3. **Git visual**: diff por arquivo (com limite de tamanho), commit só dos arquivos escolhidos, listar/criar/trocar branch (troca recusada com alterações locais — nunca sobrescreve silenciosamente), detecção de conflitos.
4. **Focus Mode**: tabela de sessões, timer com pausa/retomada, associação a projeto, resumo diário/semanal e por projeto (só dados reais).
5. **Automações**: sequências de comandos por projeto, avaliadas por `assessCommand`, sempre com confirmação explícita para executar, histórico de execuções com saída e código.
6. **Prompts reutilizáveis** na Central de IA.
7. **Dashboard**: ocultar/reordenar widgets + widget de foco.
8. Testes, changelog, documentação, site.

Fica fora deste ciclo, com motivo registrado: sincronização entre computadores (sem estratégia de conflito/autenticação), suporte declarado a Linux (sem teste em Linux).

## 8. Entrega (resultados reais)

### Implementado
| Etapa | Migration | Testes novos |
|---|---|---|
| Backup verificado, restauração segura, exportar/importar configurações | 012 | `tests/services/backup.test.ts` |
| Status e arquivamento de projetos | 013 | `tests/database/database.test.ts` |
| Git visual (diff, commit por arquivo, branches, fetch, conflitos) + correção de nomes com espaço/acento | — | `tests/services/git.test.ts` (repositório real) |
| Modo Foco | 014 | `tests/services/focus.test.ts` |
| Início personalizável | 015 | — (validado na UI) |
| Automações | 016 | `tests/services/automations.test.ts` (PowerShell real) |
| Prompts reutilizáveis | 017 | `tests/services/prompts.test.ts` |
| Nova animação de abertura | — | validada por captura de quadros |

### Validação
- `npm run check`: typecheck, lint (0 warnings) e **280 testes passando** (3 pulados: específicos de outra plataforma). Base era 234.
- Interface conferida no Electron real com perfil temporário (roteiro CDP no molde do E2E): Git/diff/branches, backup, foco (pausa realmente para o relógio), personalização do Início, automação executando `npm run lint` de verdade, prompts e abertura — **sem erros de console**.
- Revisão independente pelo Codex: 14 apontamentos; 11 confirmados e corrigidos com teste de regressão (restauração, `--no-textconv`, symlink fora da allowlist, árvore de processos no cancelamento, pathspecs literais, renomeação no commit, diff fora de ordem, duração personalizada do foco, contagem dupla); 1 aceito como arquitetura (confirmação enviada pelo renderer, igual ao resto do app); 1 documentado como limitação (sessão de foco que atravessa a meia-noite conta no dia em que começou).

### Segunda rodada
- **Sincronização entre PCs** (`syncService.ts`): pasta da nuvem escolhida pelo usuário (a autenticação é do cliente da nuvem), cópia sem dados locais e cifrada com AES-256-GCM (chave scrypt da senha de sincronização no cofre do SO), conflito decidido pelo usuário com o lado descartado preservado, nada automático. Testada com dois "PCs" simulados (`tests/services/sync.test.ts`) e na interface.
- **Workers duplicados do Monaco (P2)**: resolvido. O próprio Monaco declarava os workers e o Vite emitia cópias nunca usadas; `scripts/vite-monaco-workers.ts` as remove. Build do renderer: **28 MB → 19 MB**. Worker do TypeScript verificado no app.
- **Modo só terminais**, **equalizador do mini player** (ficava "cortado" com reduzir movimento) e **telas do README/site** refeitas.

### Não feito (com motivo)
- **Linux**: decisão do usuário (2026-10-19) de manter só Windows neste ciclo. Para portar: terminal e automações em bash, detecção de VS Code/gh/Claude/Codex fora do Windows, mini player via MPRIS, socket do Discord e alvo AppImage/deb; testar no WSL ou numa máquina Linux antes de declarar suporte.
- **Benchmarks antes/depois**: não houve otimização de desempenho que justificasse medição; o ganho estrutural é projetos arquivados não rodarem `git`.
