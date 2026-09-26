/**
 * Patch notes exibidas na aba "Novidades". A versão mais recente vem primeiro.
 * Ao publicar uma versão: bump no package.json + nova entrada aqui (pt e en).
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  title: { pt: string; en: string };
  sections: { kind: "new" | "improved" | "fixed" | "security"; items: { pt: string; en: string }[] }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.4.0",
    date: "2026-09-25",
    title: { pt: "Notion no QrzSpace", en: "Notion in QrzSpace" },
    sections: [
      {
        kind: "new",
        items: [
          {
            pt: "Integração com o Notion: conecte com o token de uma integração interna e veja, na nova aba Notion, as páginas e bancos compartilhados com ela.",
            en: "Notion integration: connect with an internal integration token and see the pages and databases shared with it in the new Notion tab.",
          },
          {
            pt: "Busque, leia páginas dentro do app, crie páginas novas (inclusive como item de um banco de dados) e abra no Notion com um clique.",
            en: "Search, read pages inside the app, create new pages (also as a database item) and open them in Notion in one click.",
          },
          {
            pt: "“Perguntar à IA”: manda o conteúdo da página para uma conversa nova, pronto para você perguntar.",
            en: "“Ask the AI”: sends the page content to a new conversation, ready for your question.",
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            pt: "Na agenda do início, os próximos dias aparecem como “Dom 27” em vez de nomes cortados.",
            en: "On the home calendar, upcoming days show as “Sun 27” instead of cut-off names.",
          },
        ],
      },
    ],
  },
  {
    version: "1.3.1",
    date: "2026-09-25",
    title: { pt: "Ícone novo", en: "New icon" },
    sections: [
      {
        kind: "improved",
        items: [
          {
            pt: "Ícone novo do QrzSpace: um “Q” luminoso em órbita, no app, na barra de tarefas, no instalador e na atividade do Discord.",
            en: "New QrzSpace icon: a glowing orbiting “Q”, in the app, the taskbar, the installer and your Discord activity.",
          },
        ],
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-09-25",
    title: { pt: "Sua assinatura, sua música e uma HUD nova", en: "Your subscription, your music and a new HUD" },
    sections: [
      {
        kind: "new",
        items: [
          {
            pt: "Claude e ChatGPT sem API key: em Integrações, “Usar minha assinatura” conversa pelo Claude Code e pelo Codex já logados no seu PC (Pro/Max e Plus/Pro). Funciona no chat, no AI Council e nas sínteses.",
            en: "Claude and ChatGPT without API keys: in Integrations, “Use my subscription” talks through the Claude Code and Codex already signed in on your PC (Pro/Max and Plus/Pro). Works in chat, AI Council and syntheses.",
          },
          {
            pt: "GitHub com um clique: “Usar login do GitHub CLI” conecta com a sessão do gh, sem copiar token.",
            en: "GitHub in one click: “Use GitHub CLI sign-in” connects with your gh session, no token copying.",
          },
          {
            pt: "Mini player novo: mostra a música que está tocando no Spotify do PC (capa, tempo, pausar, pular, voltar e arrastar a barra), sem precisar conectar conta nem ter Premium.",
            en: "New mini player: shows what is playing in Spotify on your PC (cover, time, pause, skip, previous and drag to seek), no account or Premium needed.",
          },
        ],
      },
      {
        kind: "improved",
        items: [
          {
            pt: "HUD redesenhada: barra de título integrada ao app, botões em pílula com efeito ao pressionar e brilho, toggles e seletores com animação de mola, notificações em pílula, paleta de comandos com itens em cascata e números que rolam ao mudar.",
            en: "Redesigned HUD: title bar blended into the app, pill buttons with press and shine effects, spring-animated toggles and selectors, pill notifications, cascading command palette and rolling numbers.",
          },
        ],
      },
      {
        kind: "security",
        items: [
          {
            pt: "Pela assinatura, a IA roda com todas as ferramentas desligadas (não lê arquivos, não executa comandos, sem MCP ou plugins), numa pasta vazia e sem salvar a sessão. O QrzSpace nunca lê nem guarda o seu login.",
            en: "With a subscription, the AI runs with every tool turned off (no file reading, no commands, no MCP or plugins), in an empty folder and without saving the session. QrzSpace never reads or stores your sign-in.",
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            pt: "A bolinha dos botões liga/desliga saía para fora do botão.",
            en: "The knob of on/off switches overflowed the switch.",
          },
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-09-25",
    title: { pt: "Tudo testado de ponta a ponta", en: "End-to-end tested" },
    sections: [
      {
        kind: "fixed",
        items: [
          {
            pt: "O mini player do Spotify aparece assim que você conecta, sem precisar trocar de janela.",
            en: "The Spotify mini player shows up right after you connect, no need to switch windows.",
          },
          {
            pt: "Colar uma API key errada não derruba mais a key que já estava funcionando.",
            en: "Pasting a wrong API key no longer breaks the key that was already working.",
          },
          {
            pt: "O status do git no painel do projeto atualiza junto com a lista de alterações (arquivos novos contam como alterados).",
            en: "The git status in the project panel refreshes together with the changes list (new files count as changed).",
          },
          {
            pt: "Mensagens de erro, avisos de validação e rótulos que ainda apareciam em português na interface em inglês.",
            en: "Error messages, validation warnings and labels that still showed up in Portuguese in the English interface.",
          },
        ],
      },
      {
        kind: "improved",
        items: [
          {
            pt: "O card do Spotify em Integrações mostra a conta conectada.",
            en: "The Spotify card in Integrations shows the connected account.",
          },
          {
            pt: "Chat, AI Council, uso da IA, GitHub, Spotify, Google Agenda, git, terminal e cadastros agora passam por uma bateria de testes automáticos de ponta a ponta antes de cada versão.",
            en: "Chat, AI Council, AI usage, GitHub, Spotify, Google Calendar, git, terminal and records now go through an automated end-to-end test suite before every release.",
          },
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-09-25",
    title: { pt: "Uso da IA", en: "AI usage" },
    sections: [
      {
        kind: "new",
        items: [
          {
            pt: "Nova aba Uso na Central de IA: requisições, tokens de entrada e saída, custo estimado, gráfico por dia, tabela por modelo e últimas requisições (hoje, 7 dias, 30 dias ou tudo).",
            en: "New Usage tab in the AI hub: requests, input and output tokens, estimated cost, daily chart, per-model table and recent requests (today, 7 days, 30 days or all).",
          },
          {
            pt: "A contagem vem direto de cada provider (Claude, OpenAI e Gemini), inclusive em respostas interrompidas, no Council e nas sínteses. Nenhum texto das conversas é guardado nesse histórico.",
            en: "Counts come straight from each provider (Claude, OpenAI and Gemini), including stopped answers, the Council and syntheses. No conversation text is stored in this history.",
          },
          { pt: "Atalho no Ctrl+K: “Ver uso da IA”.", en: "Ctrl+K shortcut: “View AI usage”." },
        ],
      },
    ],
  },
  {
    version: "1.0.2",
    date: "2026-09-25",
    title: { pt: "Ícone no Discord", en: "Discord icon" },
    sections: [
      {
        kind: "fixed",
        items: [
          {
            pt: "O ícone do QrzSpace agora aparece na atividade do Discord mesmo quando o Discord ainda não carregou as imagens do app.",
            en: "The QrzSpace icon now shows in your Discord activity even before Discord has loaded the app's images.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-09-25",
    title: { pt: "QrzSpace no seu Discord", en: "QrzSpace on your Discord" },
    sections: [
      {
        kind: "new",
        items: [
          {
            pt: "Discord Rich Presence pronto para usar: o app oficial QrzSpace já vem configurado e seu perfil mostra “Jogando QrzSpace” com o ícone do app. Dá para desligar em Configurações → Discord.",
            en: "Discord Rich Presence ready to go: the official QrzSpace app comes preconfigured and your profile shows “Playing QrzSpace” with the app icon. You can turn it off in Settings → Discord.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-09-25",
    title: { pt: "Nasce o QrzSpace", en: "Say hello to QrzSpace" },
    sections: [
      {
        kind: "new",
        items: [
          { pt: "Novo nome e nova identidade: PQueiroz Workspace agora é QrzSpace.", en: "New name and identity: PQueiroz Workspace is now QrzSpace." },
          { pt: "Temas: Escuro, Claro, Meia-noite, Violeta e Areia, com prévia nas Configurações.", en: "Themes: Dark, Light, Midnight, Violet and Sand, with previews in Settings." },
          { pt: "Idioma: português ou inglês, trocando em Configurações.", en: "Language: Portuguese or English, switchable in Settings." },
          { pt: "Discord Rich Presence: mostre no seu perfil o que você está fazendo no QrzSpace (opcional).", en: "Discord Rich Presence: show on your profile what you're doing in QrzSpace (optional)." },
          { pt: "Atualização automática: novas versões são baixadas, verificadas e instaladas ao abrir o app.", en: "Automatic updates: new versions are downloaded, verified and installed when the app opens." },
          { pt: "Esta aba de Novidades, com o histórico de versões.", en: "This What's New tab, with the version history." },
        ],
      },
      {
        kind: "improved",
        items: [
          { pt: "Visual refeito: fonte Inter, sidebar agrupada, indicadores no Início e cards mais refinados.", en: "Refreshed look: Inter font, grouped sidebar, stats on Home and more refined cards." },
          { pt: "Terminal integrado com contraste garantido em qualquer tema.", en: "Built-in terminal with guaranteed contrast in every theme." },
        ],
      },
      {
        kind: "fixed",
        items: [{ pt: "Mensagem mais clara quando um repositório privado do GitHub precisa de token.", en: "Clearer message when a private GitHub repository needs a token." }],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-23",
    title: { pt: "Primeira versão", en: "First release" },
    sections: [
      {
        kind: "new",
        items: [
          { pt: "Projetos com VS Code, terminal, Explorer, Git e GitHub.", en: "Projects with VS Code, terminal, Explorer, Git and GitHub." },
          { pt: "Tarefas, agenda (com Google Calendar), clientes e marketing.", en: "Tasks, calendar (with Google Calendar), clients and marketing." },
          { pt: "Central de IA com Claude, OpenAI e Gemini, e o AI Council.", en: "AI hub with Claude, OpenAI and Gemini, plus the AI Council." },
          { pt: "Mini player do Spotify, atalhos do WhatsApp e notificações.", en: "Spotify mini player, WhatsApp shortcuts and notifications." },
        ],
      },
      {
        kind: "security",
        items: [
          { pt: "Acesso a arquivos restrito às pastas autorizadas; chaves cifradas pelo cofre do Windows.", en: "File access restricted to authorized folders; keys encrypted by the Windows vault." },
        ],
      },
    ],
  },
];
