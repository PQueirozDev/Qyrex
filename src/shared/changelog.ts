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
