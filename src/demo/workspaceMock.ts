/**
 * Implementação SIMULADA de `window.workspace` para a demo web do Qyrex
 * (portfólio). Roda a interface real do app no navegador, com dados fictícios
 * guardados só no sessionStorage: nada acessa disco, rede, IA ou Windows.
 */
import { CHANGELOG } from "../shared/changelog";
import type { WorkspaceApi } from "../preload/index";
import type {
  AIConversation,
  AIMessage,
  AIProviderId,
  AIProviderStatus,
  AppUsageSummary,
  AIStreamChunk,
  AIUsageRecord,
  AIUsageSummary,
  AppSettings,
  CalendarEvent,
  Client,
  CommandRisk,
  DirEntry,
  GitChangedFile,
  GitCommit,
  IntegrationStatus,
  IpcResult,
  LocalMediaState,
  MarketingContent,
  NotionItem,
  Project,
  ProjectWithGit,
  RecentItem,
  Task,
} from "../shared/types";

// ---------------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------------

/** A demo mostra sempre a versão mais recente do changelog (a mesma do package.json). */
const APP_VERSION = CHANGELOG[0].version;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = async <T>(data: T, delay = 60 + Math.random() * 90): Promise<IpcResult<T>> => {
  await wait(delay);
  return { ok: true, data };
};
const fail = async (error: string): Promise<IpcResult<never>> => {
  await wait(80);
  return { ok: false, error };
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const pad = (n: number) => String(n).padStart(2, "0");
const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const at = (offset: number, time: string) => `${day(offset)}T${time}:00`;
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

type Listener<T> = (payload: T) => void;
function channel<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit: (p: T) => listeners.forEach((l) => l(p)),
    on: (l: Listener<T>) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// ---------------------------------------------------------------------------------
// dados fictícios
// ---------------------------------------------------------------------------------

const ROOT = "C:\\Projetos";
const params = new URLSearchParams(location.search);

function seed() {
  const clients: Client[] = [
    { id: "c1", name: "Café Aurora", company: "Aurora Cafés Especiais", phone: null, whatsapp: "11900000001", instagram: "@cafe.aurora", email: "contato@cafeaurora.com", notes: "Quer loja virtual até dezembro.", status: "ativo", monthlyValue: 450, nextBillingDate: day(2), filesPath: null, createdAt: ago(60 * 24 * 90) },
    { id: "c2", name: "Studio Nova Pilates", company: null, phone: null, whatsapp: "11900000002", instagram: "@novapilates", email: null, notes: "Posts 3x por semana.", status: "ativo", monthlyValue: 320, nextBillingDate: day(6), filesPath: null, createdAt: ago(60 * 24 * 60) },
    { id: "c3", name: "Mecânica Veloz", company: "Veloz Auto Center", phone: "1130000000", whatsapp: "11900000003", instagram: null, email: null, notes: null, status: "prospecto", monthlyValue: null, nextBillingDate: null, filesPath: null, createdAt: ago(60 * 24 * 7) },
    { id: "c4", name: "Doce Lar Confeitaria", company: null, phone: null, whatsapp: "11900000004", instagram: "@docelar", email: null, notes: null, status: "ativo", monthlyValue: 180, nextBillingDate: day(18), filesPath: null, createdAt: ago(60 * 24 * 120) },
  ];
  const projects: Project[] = [
    { id: "p1", name: "Loja Café Aurora", description: "E-commerce com assinatura de cafés.", localPath: `${ROOT}\\cafe-aurora`, technologies: ["Next.js", "TypeScript", "Stripe"], githubUrl: "https://github.com/exemplo/cafe-aurora", clientId: "c1", favorite: true, iconMode: "auto", createdAt: ago(60 * 24 * 40), lastOpenedAt: ago(35) },
    { id: "p2", name: "App Nova Pilates", description: "Agendamento de aulas e planos.", localPath: `${ROOT}\\nova-pilates`, technologies: ["React", "Supabase"], githubUrl: "https://github.com/exemplo/nova-pilates", clientId: "c2", favorite: false, iconMode: "auto", createdAt: ago(60 * 24 * 20), lastOpenedAt: ago(60 * 26) },
    { id: "p3", name: "Bot de Orçamentos", description: "Bot de WhatsApp que monta orçamentos.", localPath: `${ROOT}\\bot-orcamentos`, technologies: ["Node.js", "Prisma"], githubUrl: null, clientId: null, favorite: false, iconMode: "auto", createdAt: ago(60 * 24 * 10), lastOpenedAt: null },
  ];
  const tasks: Task[] = [
    { id: "t1", title: "Publicar página de assinaturas", description: "Checkout com plano mensal e trimestral.", status: "em_andamento", priority: "urgente", projectId: "p1", clientId: "c1", dueDate: day(0), dueTime: "18:00", tags: ["site"], createdAt: ago(60 * 30), completedAt: null },
    { id: "t2", title: "Responder orçamento da Mecânica Veloz", description: null, status: "pendente", priority: "alta", projectId: null, clientId: "c3", dueDate: day(0), dueTime: null, tags: ["cliente"], createdAt: ago(60 * 5), completedAt: null },
    { id: "t3", title: "Carrossel: 5 exercícios para a lombar", description: null, status: "pendente", priority: "normal", projectId: null, clientId: "c2", dueDate: day(1), dueTime: null, tags: ["instagram"], createdAt: ago(60 * 20), completedAt: null },
    { id: "t4", title: "Corrigir fuso horário das reservas", description: null, status: "pendente", priority: "alta", projectId: "p2", clientId: "c2", dueDate: day(-1), dueTime: null, tags: ["bug"], createdAt: ago(60 * 48), completedAt: null },
    { id: "t5", title: "Configurar domínio do Café Aurora", description: null, status: "concluido", priority: "normal", projectId: "p1", clientId: "c1", dueDate: day(-2), dueTime: null, tags: [], createdAt: ago(60 * 72), completedAt: ago(90) },
  ];
  const events: CalendarEvent[] = [
    { id: "e1", title: "Aula — Estrutura de Dados", description: null, startsAt: at(0, "19:00"), endsAt: at(0, "22:00"), location: "Senac", source: "local", externalId: null, createdAt: ago(1000) },
    { id: "e2", title: "Call com Café Aurora", description: "Aprovar layout da home", startsAt: at(0, "15:30"), endsAt: at(0, "16:00"), location: "Google Meet", source: "google", externalId: "g1", createdAt: ago(1000) },
    { id: "e3", title: "Entrega do App Nova Pilates", description: null, startsAt: at(2, "10:00"), endsAt: null, location: null, source: "local", externalId: null, createdAt: ago(1000) },
    { id: "e4", title: "Gravar vídeos da confeitaria", description: null, startsAt: at(4, "14:00"), endsAt: at(4, "17:00"), location: "Doce Lar", source: "google", externalId: "g2", createdAt: ago(1000) },
  ];
  const marketing: MarketingContent[] = [
    { id: "m1", clientId: "c2", type: "post", title: "5 exercícios para a lombar", description: null, caption: "Sua coluna agradece 🙌", status: "produzindo", scheduledDate: day(1), files: [], createdAt: ago(2000) },
    { id: "m2", clientId: "c4", type: "reel", title: "Bastidores: bolo de pistache", description: null, caption: null, status: "ideia", scheduledDate: day(3), files: [], createdAt: ago(2000) },
    { id: "m3", clientId: "c1", type: "story", title: "Lançamento das assinaturas", description: null, caption: null, status: "pronto", scheduledDate: day(0), files: [], createdAt: ago(2000) },
    { id: "m4", clientId: "c1", type: "post", title: "Métodos de preparo: V60", description: null, caption: null, status: "publicado", scheduledDate: day(-3), files: [], createdAt: ago(5000) },
  ];
  const conversations: AIConversation[] = [
    { id: "a1", title: "Ideias para a página de assinaturas", provider: "anthropic", model: "opus", projectId: "p1", createdAt: ago(60 * 3) },
  ];
  const messages: AIMessage[] = [
    { id: "am1", conversationId: "a1", role: "user", content: "Me dê 3 ideias de seção para a página de assinaturas do Café Aurora.", attachedFiles: [], createdAt: ago(60 * 3) },
    {
      id: "am2", conversationId: "a1", role: "assistant", attachedFiles: [], createdAt: ago(60 * 3 - 1),
      content: "Boa! Três seções que costumam converter bem:\n\n1. **Monte sua caixa** — o cliente escolhe torra, moagem e frequência, vendo o preço mudar na hora.\n2. **Do grão à xícara** — fotos da fazenda e do processo, com o nome do produtor de cada lote.\n3. **Perguntas frequentes** — pausar, pular um mês e cancelar sem burocracia.\n\nPara rodar o projeto e testar:\n\n```powershell\nnpm run dev\n```",
    },
  ];
  const settings: AppSettings = {
    userName: "Visitante",
    theme: "dark",
    language: params.get("lang") === "en" ? "en" : "pt",
    discord: { enabled: false, clientId: null, showProject: false },
    autoUpdate: true,
    lastSeenVersion: APP_VERSION,
    startWithSystem: false,
    minimizeToTray: true,
    allowedProjectDirs: [ROOT],
    allowAllDirs: false,
    defaultTerminal: "powershell",
    aiDefaultProvider: "anthropic",
    aiDefaultModel: null,
    notifications: { tasks: true, events: true, billing: true, marketing: true },
    onboardingCompleted: true,
    splashAnimation: true,
    businessMode: true,
    vscodePath: "C:\\Program Files\\Microsoft VS Code\\Code.exe",
  };
  const changes: Record<string, GitChangedFile[]> = {
    p1: [{ status: "M", path: "src/app/assinaturas/page.tsx" }, { status: "??", path: "src/components/PlanPicker.tsx" }],
    p2: [],
    p3: [{ status: "M", path: "src/flows/orcamento.ts" }],
  };
  const commits: Record<string, GitCommit[]> = {
    p1: [
      { hash: "a1b2c3d4e5", shortHash: "a1b2c3d", author: "Visitante", date: ago(60 * 5), subject: "Checkout com plano trimestral" },
      { hash: "b2c3d4e5f6", shortHash: "b2c3d4e", author: "Visitante", date: ago(60 * 30), subject: "Home com vitrine de cafés" },
    ],
    p2: [{ hash: "c3d4e5f6a7", shortHash: "c3d4e5f", author: "Visitante", date: ago(60 * 26), subject: "Reserva de aulas em lote" }],
    p3: [{ hash: "d4e5f6a7b8", shortHash: "d4e5f6a", author: "Visitante", date: ago(60 * 50), subject: "Primeiro commit" }],
  };
  const activity: RecentItem[] = [
    { id: "r2", itemType: "task_completed", itemId: "t5", label: "Configurar domínio do Café Aurora", openedAt: ago(90) },
    { id: "r3", itemType: "project", itemId: "p1", label: "Loja Café Aurora", openedAt: ago(35) },
  ];
  return { clients, projects, tasks, events, marketing, conversations, messages, settings, changes, commits, activity, allowedCommands: [] as string[] };
}

const KEY = "qrz-demo-state";
type State = ReturnType<typeof seed>;
let db: State;
try {
  const saved = sessionStorage.getItem(KEY);
  db = saved ? (JSON.parse(saved) as State) : seed();
} catch {
  db = seed();
}
const save = () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // sem storage: a demo funciona, só não guarda entre recarregamentos
  }
};
export function resetDemo() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(AVATAR_KEY);
  localStorage.removeItem("qrz.theme");
  location.reload();
}

// Foto de perfil da demo: escolhida por um <input type="file"> do navegador,
// recortada no quadrado central por um canvas (256 px) e guardada só na sessão.
const AVATAR_KEY = "qrz-demo-avatar";
function readDemoAvatar(): string | null {
  try {
    return sessionStorage.getItem(AVATAR_KEY);
  } catch {
    return null;
  }
}
function writeDemoAvatar(url: string | null) {
  try {
    if (url) sessionStorage.setItem(AVATAR_KEY, url);
    else sessionStorage.removeItem(AVATAR_KEY);
  } catch {
    // sem storage: a foto vale só até recarregar
  }
}
function pickDemoAvatar(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        canvas.getContext("2d")?.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
        URL.revokeObjectURL(img.src);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
    input.click();
  });
}

// ---------------------------------------------------------------------------------
// IA simulada
// ---------------------------------------------------------------------------------

const PROVIDER_LABELS: Record<AIProviderId, string> = { anthropic: "Claude", openai: "OpenAI", google: "Gemini" };
const providers = (): AIProviderStatus[] => [
  { id: "anthropic", label: "Claude", connected: true, authMode: "subscription", account: "Assinatura Pro (demo)", maskedKey: null, models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }, { id: "haiku", label: "Haiku" }], defaultModel: "opus" },
  { id: "openai", label: "OpenAI", connected: true, authMode: "subscription", account: "ChatGPT (demo)", maskedKey: null, models: [{ id: "default", label: "Padrão do Codex" }], defaultModel: "default" },
  { id: "google", label: "Gemini", connected: true, authMode: "key", account: null, maskedKey: "AIza••••demo", models: [{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }, { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }], defaultModel: "gemini-2.5-pro" },
];

const stream = channel<AIStreamChunk>();
const aborted = new Set<string>();
const usage: AIUsageRecord[] = [];

function answerFor(provider: AIProviderId, prompt: string, kind: "chat" | "council" | "synthesis"): string {
  const p = prompt.toLowerCase();
  const who = PROVIDER_LABELS[provider];
  if (kind === "synthesis") {
    return "**Síntese do conselho**\n\nOs três modelos concordam no essencial: comece pelo que traz receita recorrente e deixe o resto para uma segunda fase.\n\n- **Consenso:** assinatura com checkout simples e opção de pausar.\n- **Divergência:** o Gemini sugere app; Claude e OpenAI preferem PWA no início.\n- **Recomendação:** lance o site com assinaturas em 2 semanas e valide antes de investir em app.";
  }
  if (kind === "council") {
    const takes: Record<AIProviderId, string> = {
      anthropic: "Eu priorizaria **assinaturas** primeiro: receita previsível e dá para medir retenção desde o primeiro mês. Um PWA resolve o \"app\" sem custo extra de loja.",
      openai: "Comece pelo **checkout de assinatura** com Stripe e um painel simples para o cliente pausar ou trocar o café. App nativo só depois de 300 assinantes.",
      google: "Vale considerar um **app** desde o início para notificações de entrega, mas com uma versão web enxuta primeiro para validar o preço.",
    };
    return takes[provider];
  }
  if (/comando|terminal|rodar|instalar|git/.test(p)) {
    return `Claro! No terminal do projeto:\n\n\`\`\`powershell\ngit status\n\`\`\`\n\nE para subir o ambiente de desenvolvimento:\n\n\`\`\`powershell\nnpm run dev\n\`\`\`\n\nClique em **Executar** em qualquer bloco: o Qyrex avalia o risco e pede sua permissão antes de rodar.`;
  }
  if (/post|instagram|marketing|legenda/.test(p)) {
    return "Três ideias de post:\n\n1. **Antes e depois** em carrossel, com o passo a passo no último slide.\n2. **Bastidores** em reel curto (15 s) com música em alta.\n3. **Pergunta da semana** nos stories, respondida no feed na sexta.\n\nQuer que eu escreva as legendas?";
  }
  if (/orçamento|preço|cobrar|valor/.test(p)) {
    return "Uma forma simples de montar o orçamento:\n\n| Item | Horas | Valor |\n|---|---|---|\n| Layout | 8 | R$ 800 |\n| Desenvolvimento | 20 | R$ 2.000 |\n| Publicação | 2 | R$ 200 |\n\n**Total: R$ 3.000**, com manutenção mensal opcional de R$ 250.";
  }
  return `Aqui é o ${who} na demo do Qyrex. 👋\n\nNo app de verdade eu respondo pela sua **assinatura** (Claude Code / Codex) ou por API key, com o contexto do projeto e dos arquivos que você anexar.\n\nExperimente pedir: *"me passe um comando para rodar o projeto"*, *"ideias de post"* ou *"monte um orçamento"*.`;
}

async function runStream(requestId: string, provider: AIProviderId, model: string, text: string, source: AIUsageRecord["source"], onDone?: (full: string) => void) {
  await wait(350 + Math.random() * 400);
  let full = "";
  const parts = text.match(/[\s\S]{1,6}/g) ?? [];
  for (const part of parts) {
    if (aborted.has(requestId)) break;
    full += part;
    stream.emit({ requestId, type: "delta", text: part });
    await wait(12 + Math.random() * 18);
  }
  const wasAborted = aborted.delete(requestId);
  onDone?.(full);
  const input = 400 + Math.round(Math.random() * 900);
  const output = Math.ceil(full.length / 4);
  usage.unshift({ id: uid(), createdAt: new Date().toISOString(), provider, model, source, inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0, estimated: false, aborted: wasAborted, costUsd: provider === "google" ? null : 0 });
  stream.emit({ requestId, type: "done" });
}

/** Histórico de exemplo do tempo de uso do app (determinístico; fins de semana com menos uso). */
function appUsageSummary(days: number): AppUsageSummary {
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let rnd = 11;
  const next = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  const all: AppUsageSummary["days"] = [];
  for (let i = 199; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const skip = i > 12 && next() < (weekend ? 0.65 : 0.18);
    const seconds = skip ? 0 : Math.round((weekend ? 1800 : 5400) + next() * (weekend ? 3600 : 14400)) - (i === 0 ? 3600 : 0);
    all.push({ day: key(d), seconds: Math.max(0, seconds), sessions: skip ? 0 : 1 + Math.floor(next() * 3) });
  }
  const used = all.filter((d) => d.seconds > 0);
  let current = 0;
  for (let i = all.length - 1; i >= 0 && all[i].seconds > 0; i--) current++;
  let longest = 0;
  let run = 0;
  for (const d of all) longest = Math.max(longest, (run = d.seconds > 0 ? run + 1 : 0));
  return {
    days: all.slice(-days),
    todaySeconds: all[all.length - 1].seconds,
    totalSeconds: used.reduce((s, d) => s + d.seconds, 0),
    activeDays: used.length,
    currentStreak: current,
    longestStreak: longest,
    firstDay: all[0].day,
  };
}

function usageSummary(days: number | null): AIUsageSummary {
  // Histórico de exemplo dos últimos 30 dias + o que foi usado nesta visita.
  const byDay: AIUsageSummary["byDay"] = [];
  const span = days ?? 30;
  let rnd = 7;
  const next = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  for (let i = span - 1; i >= 0; i--) {
    const input = i === 0 ? 0 : Math.round(2000 + next() * 18000);
    const output = Math.round(input * (0.25 + next() * 0.2));
    byDay.push({ date: day(-i), inputTokens: input, outputTokens: output, costUsd: 0, byProvider: { anthropic: input * 0.6, openai: input * 0.25, google: input * 0.15 } });
  }
  const today = byDay[byDay.length - 1];
  for (const u of usage) {
    today.inputTokens += u.inputTokens;
    today.outputTokens += u.outputTokens;
  }
  const sumIn = byDay.reduce((s, d) => s + d.inputTokens, 0);
  const sumOut = byDay.reduce((s, d) => s + d.outputTokens, 0);
  const requests = Math.round(sumIn / 1100) + usage.length;
  const split = (share: number, provider: AIProviderId, model: string) => ({
    provider, model, requests: Math.round(requests * share), inputTokens: Math.round(sumIn * share), outputTokens: Math.round(sumOut * share), cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, unpricedRequests: provider === "google" ? Math.round(requests * share) : 0,
  });
  return {
    days,
    totals: { requests, inputTokens: sumIn, outputTokens: sumOut, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, unpricedRequests: Math.round(requests * 0.15) },
    byModel: [split(0.6, "anthropic", "claude-code/opus"), split(0.25, "openai", "codex/default"), split(0.15, "google", "gemini-2.5-pro")],
    byDay,
    recent: usage.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------------
// música, terminal e arquivos simulados
// ---------------------------------------------------------------------------------

const cover = (a: string, b: string, emoji: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="120" height="120" fill="url(#g)"/><text x="60" y="76" font-size="46" text-anchor="middle">${emoji}</text></svg>`)}`;
const playlist = [
  { title: "Madrugada no Código", artist: "Lo-fi Studio", album: "Foco Total", durationMs: 184_000, coverUrl: cover("#6f5cff", "#2ed3ee", "🌙") },
  { title: "Café e Commit", artist: "Beats de Segunda", album: "Deploy Sexta", durationMs: 203_000, coverUrl: cover("#f59e0b", "#ef4444", "☕") },
  { title: "Cidade Neon", artist: "Synth Paulista", album: "Avenida", durationMs: 221_000, coverUrl: cover("#ec4899", "#8b5cf6", "🌆") },
];
const player = { index: 0, playing: true, position: 42_000, since: Date.now() };
const position = () => {
  const t = playlist[player.index];
  let p = player.position + (player.playing ? Date.now() - player.since : 0);
  if (p >= t.durationMs) {
    player.index = (player.index + 1) % playlist.length;
    player.position = 0;
    player.since = Date.now();
    p = 0;
  }
  return p;
};
function media(): LocalMediaState {
  const p = position();
  const t = playlist[player.index];
  return { app: "Spotify.exe", isSpotify: true, title: t.title, artist: t.artist, album: t.album, isPlaying: player.playing, positionMs: p, durationMs: t.durationMs, canNext: true, canPrevious: true, canSeek: true, coverUrl: t.coverUrl };
}

const termData = channel<{ id: string; data: string }>();
const termExit = channel<{ id: string; exitCode: number }>();
const terms = new Map<string, { cwd: string; line: string }>();
const prompt = (cwd: string) => `\r\n\x1b[38;5;111mPS\x1b[0m ${cwd}> `;
function termRun(id: string, cmd: string) {
  const t = terms.get(id)!;
  const c = cmd.trim();
  let out = "";
  if (!c) out = "";
  else if (/^(ls|dir)$/i.test(c)) out = "\r\n    Diretório: " + t.cwd + "\r\n\r\nMode   Name\r\n----   ----\r\nd----  src\r\nd----  public\r\n-a---  package.json\r\n-a---  README.md";
  else if (/^git status$/i.test(c)) out = "\r\nOn branch main\r\nChanges not staged for commit:\r\n  \x1b[31mmodified:   src/app/assinaturas/page.tsx\x1b[0m";
  else if (/^npm run dev$/i.test(c)) out = "\r\n\x1b[32m▲ Next.js 15\x1b[0m\r\n- Local:  http://localhost:3000\r\n\x1b[32m✓ Ready in 1.2s\x1b[0m";
  else if (/^echo /i.test(c)) out = "\r\n" + c.slice(5);
  else if (/^(cls|clear)$/i.test(c)) { termData.emit({ id, data: "\x1b[2J\x1b[H" + prompt(t.cwd).slice(2) }); return; }
  else out = `\r\n\x1b[33m(demo)\x1b[0m No app de verdade este é um PowerShell real. Tente: dir, git status, npm run dev, echo olá, cls`;
  termData.emit({ id, data: out + prompt(t.cwd) });
}

const FILES: Record<string, DirEntry[]> = {};
const entry = (dir: string, name: string, isDirectory: boolean, size = 0): DirEntry => ({ name, path: `${dir}\\${name}`, isDirectory, size, modifiedAt: ago(Math.round(Math.random() * 5000)) });
FILES[ROOT] = ["cafe-aurora", "nova-pilates", "bot-orcamentos"].map((n) => entry(ROOT, n, true));
for (const p of ["cafe-aurora", "nova-pilates", "bot-orcamentos"]) {
  const dir = `${ROOT}\\${p}`;
  FILES[dir] = [entry(dir, "src", true), entry(dir, "public", true), entry(dir, "package.json", false, 1480), entry(dir, "README.md", false, 2210), entry(dir, "logo.png", false, 48_200)];
  FILES[`${dir}\\src`] = [entry(`${dir}\\src`, "app", true), entry(`${dir}\\src`, "index.ts", false, 920)];
  FILES[`${dir}\\public`] = [entry(`${dir}\\public`, "favicon.ico", false, 4200)];
  FILES[`${dir}\\src\\app`] = [entry(`${dir}\\src\\app`, "page.tsx", false, 3100)];
}
const allFiles = () => Object.values(FILES).flat();
/** Textos salvos pelo editor na demo (só nesta sessão). */
const EDITED: Record<string, { content: string; mtimeMs: number }> = {};

// ---------------------------------------------------------------------------------
// Notion simulado
// ---------------------------------------------------------------------------------

const notionPages: (NotionItem & { markdown: string })[] = [
  { id: "11111111-1111-4111-8111-111111111111", type: "page", title: "Briefing — Loja Café Aurora", icon: "☕", url: "https://www.notion.so", lastEditedAt: ago(40), markdown: "# Objetivo\n\nVender assinaturas mensais de café especial.\n\n## Público\n\n- Quem trabalha em casa\n- Presentes corporativos\n\n## Entregas\n\n- [x] Home com vitrine\n- [ ] Página de assinaturas\n- [ ] Cupom de desconto\n\n> Prazo combinado: fim do mês." },
  { id: "22222222-2222-4222-8222-222222222222", type: "page", title: "Ideias de conteúdo — outubro", icon: "💡", url: "https://www.notion.so", lastEditedAt: ago(60 * 20), markdown: "## Nova Pilates\n\n- Carrossel: 5 exercícios para a lombar\n- Reel: rotina de 10 minutos\n\n## Doce Lar\n\n- Bastidores do bolo de pistache\n- Enquete: sabor do mês" },
  { id: "33333333-3333-4333-8333-333333333333", type: "database", title: "Clientes & Propostas", icon: "🗂️", url: "https://www.notion.so", lastEditedAt: ago(60 * 5), markdown: "" },
  { id: "44444444-4444-4444-8444-444444444444", type: "page", title: "Checklist de publicação de site", icon: "✅", url: "https://www.notion.so", lastEditedAt: ago(60 * 72), markdown: "- [ ] Domínio apontado\n- [ ] HTTPS ativo\n- [ ] Favicon e prévia (og:image)\n- [ ] Google Analytics\n- [ ] Testar no celular" },
];
const notionItem = ({ markdown: _m, ...item }: (typeof notionPages)[number]): NotionItem => item;

// ---------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------

const withGit = (p: Project): ProjectWithGit => ({
  ...p,
  iconMode: p.iconMode ?? "auto",
  icon: null,
  git: { branch: "main", modifiedCount: db.changes[p.id]?.length ?? 0, isRepo: true, ahead: p.id === "p1" ? 1 : 0, behind: 0, remoteUrl: p.githubUrl },
});
const projectByPath = (path: string) => db.projects.find((p) => path.toLowerCase().startsWith(p.localPath.toLowerCase()));
const risk = (cmd: string): CommandRisk => (/\b(rm|del|remove-item|format|rd|rmdir)\b|--force|reset --hard/i.test(cmd) ? "dangerous" : /^(git status|dir|ls|echo|npm run dev|node -v|npm -v)\b/i.test(cmd.trim()) ? "safe" : "normal");
const DEMO_ONLY = "Na demo web isso não abre nada no seu computador — no app desktop abre de verdade.";

export const workspaceMock: WorkspaceApi = {
  settings: {
    get: () => ok(db.settings, 20),
    update: async (patch) => {
      db.settings = { ...db.settings, ...patch } as AppSettings;
      save();
      return ok(db.settings);
    },
    addAllowedDir: () => fail("Na demo, as pastas já vêm autorizadas (C:\\Projetos)."),
    removeAllowedDir: () => fail("Na demo não é possível remover a pasta de exemplo."),
  },
  profile: {
    getAvatar: () => ok(readDemoAvatar(), 10),
    pickAvatar: async () => {
      const url = await pickDemoAvatar();
      if (url) writeDemoAvatar(url);
      return ok(url, 10);
    },
    removeAvatar: () => {
      writeDemoAvatar(null);
      return ok(null, 10);
    },
  },
  appUsage: {
    summary: (days: number) => ok(appUsageSummary(days), 40),
  },
  system: {
    info: () => ok({ platform: "win32", appVersion: APP_VERSION, vscodePath: db.settings.vscodePath, logsDir: null, terminalAvailable: true, driveRoots: ["C:\\"] }, 20),
    memory: () => ok(412, 10),
    setTitleBarColors: () => ok(undefined, 0),
    openVSCode: () => fail(DEMO_ONLY),
    openExplorer: () => fail(DEMO_ONLY),
    openFile: () => fail(DEMO_ONLY),
    openTerminal: () => fail(DEMO_ONLY),
    openExternalUrl: async (url) => {
      window.open(url, "_blank", "noopener");
      return ok(undefined);
    },
    pickDirectory: () => fail("Na demo web não há seletor de pastas. Use os projetos de exemplo."),
    pickVSCode: () => ok(null),
    detectVSCode: () => ok(db.settings.vscodePath),
    openLogs: () => fail(DEMO_ONLY),
    openWhatsApp: () => fail(DEMO_ONLY),
    whatsappStatus: () => ok({ desktopInstalled: true }),
    openWhatsAppChat: () => fail(DEMO_ONLY),
    whatsappUrl: (input) => ok(`https://wa.me/${input.phone}`),
    openSpotifyApp: () => fail(DEMO_ONLY),
  },
  projects: {
    list: () => ok(db.projects.map(withGit)),
    detect: (p) => ok({ name: p.split("\\").pop() ?? null, technologies: ["TypeScript"], githubUrl: null, hasPackageJson: true, isGitRepo: true, icon: null }),
    create: () => fail("Na demo não dá para adicionar pastas do seu PC. Explore os projetos de exemplo!"),
    update: async (id, patch) => {
      const p = db.projects.find((x) => x.id === id)!;
      Object.assign(p, patch);
      save();
      return ok(p);
    },
    toggleFavorite: async (id) => {
      const p = db.projects.find((x) => x.id === id)!;
      p.favorite = !p.favorite;
      save();
      return ok(undefined);
    },
    touchOpened: async (id) => {
      const p = db.projects.find((x) => x.id === id);
      if (p) p.lastOpenedAt = new Date().toISOString();
      save();
      return ok(undefined);
    },
    delete: async (id) => {
      db.projects = db.projects.filter((p) => p.id !== id);
      save();
      return ok(undefined);
    },
    pickIcon: () => fail(DEMO_ONLY),
    setIconMode: async (id, mode) => {
      const p = db.projects.find((x) => x.id === id);
      if (p) p.iconMode = mode;
      save();
      return ok(null);
    },
  },
  git: {
    status: (path) => {
      const p = projectByPath(path);
      return ok(p ? withGit(p).git! : { branch: null, modifiedCount: 0, isRepo: false, ahead: 0, behind: 0, remoteUrl: null });
    },
    commits: (path) => ok(db.commits[projectByPath(path)?.id ?? ""] ?? []),
    changes: (path) => ok(db.changes[projectByPath(path)?.id ?? ""] ?? []),
    commit: async (input) => {
      const p = projectByPath(input.projectPath);
      if (!p) return fail("Projeto não encontrado.");
      if (!(db.changes[p.id] ?? []).length) return fail("Nada para commitar.");
      const hash = uid().replace(/-/g, "").slice(0, 10);
      (db.commits[p.id] ??= []).unshift({ hash, shortHash: hash.slice(0, 7), author: db.settings.userName, date: new Date().toISOString(), subject: input.message });
      db.changes[p.id] = [];
      db.activity.unshift({ id: uid(), itemType: "commit", itemId: p.id, label: input.message, openedAt: new Date().toISOString() });
      save();
      return ok(`[main ${hash.slice(0, 7)}] ${input.message}`, 500);
    },
    pull: () => ok("Already up to date.", 700),
    push: () => ok("Enviado para origin/main (simulação).", 900),
  },
  github: {
    overview: (url) =>
      ok({
        repo: { fullName: url.replace("https://github.com/", ""), description: "Repositório de exemplo da demo", defaultBranch: "main", stars: 12, openIssues: 2, htmlUrl: url, private: true },
        issues: [
          { number: 14, title: "Cupom de desconto no checkout", state: "open", author: "cliente-aurora", htmlUrl: url, updatedAt: ago(300) },
          { number: 11, title: "Fotos dos cafés carregando lentas", state: "open", author: "visitante", htmlUrl: url, updatedAt: ago(2000) },
        ],
        pulls: [{ number: 15, title: "Página de assinaturas", state: "open", author: "visitante", htmlUrl: url, updatedAt: ago(60) }],
      }, 400),
    connect: () => fail("Na demo o GitHub já vem conectado."),
    ghCliAvailable: () => ok(true),
    connectGhCli: () => ok({ login: "visitante-demo" }, 600),
    disconnect: () => ok(undefined),
    test: () => ok({ ok: true }),
  },
  tasks: {
    list: (filter) =>
      ok(db.tasks.filter((t) => (!filter?.status || t.status === filter.status) && (!filter?.projectId || t.projectId === filter.projectId) && (!filter?.clientId || t.clientId === filter.clientId))),
    create: async (input) => {
      const t: Task = { id: uid(), title: input.title, description: input.description ?? null, status: input.status ?? "pendente", priority: input.priority ?? "normal", projectId: input.projectId ?? null, clientId: input.clientId ?? null, dueDate: input.dueDate ?? null, dueTime: input.dueTime ?? null, tags: input.tags ?? [], createdAt: new Date().toISOString(), completedAt: null };
      db.tasks.unshift(t);
      save();
      return ok(t);
    },
    update: async (id, patch) => {
      const t = db.tasks.find((x) => x.id === id)!;
      const wasDone = t.status === "concluido";
      Object.assign(t, patch);
      if (t.status === "concluido" && !wasDone) {
        t.completedAt = new Date().toISOString();
        db.activity.unshift({ id: uid(), itemType: "task_completed", itemId: t.id, label: t.title, openedAt: t.completedAt });
      }
      if (t.status !== "concluido") t.completedAt = null;
      save();
      return ok(t);
    },
    delete: async (id) => {
      db.tasks = db.tasks.filter((t) => t.id !== id);
      save();
      return ok(undefined);
    },
  },
  files: {
    list: (dir) => (FILES[dir] ? ok(FILES[dir]) : fail(`Acesso negado: "${dir}" está fora dos diretórios autorizados.`)),
    createFolder: async (dir, name) => {
      const e = entry(dir, name, true);
      (FILES[dir] ??= []).unshift(e);
      FILES[e.path] = [];
      return ok(e);
    },
    rename: async (p, newName) => {
      const dir = p.slice(0, p.lastIndexOf("\\"));
      const e = FILES[dir]?.find((x) => x.path === p);
      if (e) {
        e.name = newName;
        e.path = `${dir}\\${newName}`;
      }
      return ok(`${dir}\\${newName}`);
    },
    copy: (source, destDir) => ok(`${destDir}\\${source.split("\\").pop()}`),
    move: (source, destDir) => ok(`${destDir}\\${source.split("\\").pop()}`),
    delete: async (p) => {
      const dir = p.slice(0, p.lastIndexOf("\\"));
      FILES[dir] = (FILES[dir] ?? []).filter((x) => x.path !== p);
      return ok(undefined);
    },
    preview: (p) => {
      if (p.endsWith(".png") || p.endsWith(".ico")) return ok({ kind: "image" as const, dataUrl: cover("#6f5cff", "#2ed3ee", "☕") });
      if (p.endsWith("package.json")) return ok({ kind: "text" as const, language: "json", truncated: false, content: '{\n  "name": "cafe-aurora",\n  "scripts": { "dev": "next dev", "build": "next build" },\n  "dependencies": { "next": "^15.0.0", "react": "^19.0.0" }\n}' });
      return ok({ kind: "text" as const, language: p.endsWith(".md") ? "markdown" : "typescript", truncated: false, content: p.endsWith(".md") ? "# Projeto de exemplo\n\nArquivo fictício da demo do Qyrex." : "export function hello() {\n  return 'Olá da demo do Qyrex';\n}\n" });
    },
    search: (query) => ok(allFiles().filter((f) => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 30)),
    isAllowed: (p) => ok(p.toLowerCase().startsWith(ROOT.toLowerCase())),
    // Editor: o texto salvo fica só na sessão da demo (com mtime, para o conflito funcionar igual ao app).
    readForEdit: async (p) => {
      if (p.endsWith(".png") || p.endsWith(".ico")) return fail("Arquivo binário — não dá para editar no Qyrex.");
      if (!allFiles().some((f) => f.path === p && !f.isDirectory)) return fail(`Caminho não encontrado: ${p}`);
      const saved = EDITED[p];
      if (saved) return ok({ path: p, content: saved.content, mtimeMs: saved.mtimeMs, size: saved.content.length, bom: false, eol: "\n" as const });
      const preview = await workspaceMock.files.preview(p);
      const content = preview.ok && preview.data.kind === "text" ? preview.data.content : "";
      return ok({ path: p, content, mtimeMs: 1, size: content.length, bom: false, eol: "\n" as const });
    },
    save: async ({ path: p, content, expectedMtimeMs, force }) => {
      const current = EDITED[p]?.mtimeMs ?? 1;
      if (!force && expectedMtimeMs !== null && expectedMtimeMs !== current) return ok({ status: "conflict" as const, mtimeMs: current });
      EDITED[p] = { content, mtimeMs: Date.now() };
      return ok({ status: "saved" as const, mtimeMs: EDITED[p].mtimeMs, size: content.length });
    },
    createFile: async (dir, name) => {
      if (FILES[dir]?.some((x) => x.name === name)) return fail("Já existe um item com esse nome.");
      const e = entry(dir, name, false);
      (FILES[dir] ??= []).push(e);
      EDITED[e.path] = { content: "", mtimeMs: Date.now() };
      return ok(e);
    },
  },
  search: {
    global: (q) => {
      const s = q.toLowerCase();
      const has = (v: string | null) => Boolean(v && v.toLowerCase().includes(s));
      return ok({
        projects: db.projects.filter((p) => has(p.name) || has(p.description)),
        tasks: db.tasks.filter((t) => has(t.title)),
        clients: db.clients.filter((c) => has(c.name) || has(c.company)),
        marketing: db.marketing.filter((m) => has(m.title)),
        files: allFiles().filter((f) => has(f.name)).slice(0, 8),
      });
    },
  },
  activity: { list: (limit) => ok(db.activity.slice(0, limit ?? 20)) },
  clients: {
    list: (search) => ok(db.clients.filter((c) => !search || `${c.name} ${c.company ?? ""}`.toLowerCase().includes(search.toLowerCase()))),
    get: (id) => ok(db.clients.find((c) => c.id === id) ?? null),
    create: async (input) => {
      const c: Client = { id: uid(), company: null, phone: null, whatsapp: null, instagram: null, email: null, notes: null, status: "ativo", monthlyValue: null, nextBillingDate: null, filesPath: null, createdAt: new Date().toISOString(), ...input } as Client;
      db.clients.unshift(c);
      save();
      return ok(c);
    },
    update: async (id, patch) => {
      const c = db.clients.find((x) => x.id === id)!;
      Object.assign(c, patch);
      save();
      return ok(c);
    },
    delete: async (id) => {
      db.clients = db.clients.filter((c) => c.id !== id);
      save();
      return ok(undefined);
    },
  },
  marketing: {
    list: (filter) => ok(db.marketing.filter((m) => !filter?.clientId || m.clientId === filter.clientId)),
    create: async (input) => {
      const m: MarketingContent = { id: uid(), clientId: input.clientId ?? null, type: input.type, title: input.title, description: input.description ?? null, caption: input.caption ?? null, status: input.status ?? "ideia", scheduledDate: input.scheduledDate ?? null, files: input.files ?? [], createdAt: new Date().toISOString() };
      db.marketing.unshift(m);
      save();
      return ok(m);
    },
    update: async (id, patch) => {
      const m = db.marketing.find((x) => x.id === id)!;
      Object.assign(m, patch);
      save();
      return ok(m);
    },
    delete: async (id) => {
      db.marketing = db.marketing.filter((m) => m.id !== id);
      save();
      return ok(undefined);
    },
  },
  calendar: {
    // Como o calendarService: só o intervalo pedido, em ordem de horário.
    list: (range) =>
      ok(
        db.events
          .filter((e) => !range || (e.startsAt <= range.to && (e.endsAt ?? e.startsAt) >= range.from))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      ),
    create: async (input) => {
      const e: CalendarEvent = { id: uid(), title: input.title, description: input.description ?? null, startsAt: input.startsAt, endsAt: input.endsAt ?? null, location: input.location ?? null, source: "local", externalId: null, createdAt: new Date().toISOString() };
      db.events.push(e);
      save();
      return ok(e);
    },
    update: async (id, patch) => {
      const e = db.events.find((x) => x.id === id)!;
      Object.assign(e, patch);
      save();
      return ok(e);
    },
    delete: async (id) => {
      db.events = db.events.filter((e) => e.id !== id);
      save();
      return ok(undefined);
    },
  },
  ai: {
    providers: () => ok(providers()),
    refreshModels: () => ok(providers(), 500),
    connect: () => fail("Na demo as IAs já vêm conectadas."),
    disconnect: () => fail("Na demo não é possível desconectar as IAs de exemplo."),
    test: () => ok({ ok: true }, 400),
    subscriptions: () => ok([{ provider: "anthropic" as const, cli: "claude" as const, installed: true, loggedIn: true, account: "Assinatura Pro (demo)" }, { provider: "openai" as const, cli: "codex" as const, installed: true, loggedIn: true, account: "ChatGPT" }]),
    limits: () => {
      const at = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();
      const fetchedAt = new Date().toISOString();
      return ok([
        { provider: "anthropic" as const, cli: "claude" as const, available: true, plan: "pro", resetCredits: null, limited: false, error: null, fetchedAt, windows: [{ kind: "session" as const, label: null, usedPercent: 31, resetsAt: at(268) }, { kind: "week" as const, label: null, usedPercent: 62, resetsAt: at(3 * 1440 + 128) }] },
        { provider: "openai" as const, cli: "codex" as const, available: true, plan: "plus", resetCredits: 1, limited: false, error: null, fetchedAt, windows: [{ kind: "session" as const, label: null, usedPercent: 13, resetsAt: at(18) }, { kind: "week" as const, label: null, usedPercent: 49, resetsAt: at(4 * 1440 + 1080) }] },
      ], 300);
    },
    connectSubscription: () => ok({ ok: true, account: "demo" }, 500),
    conversations: {
      list: (projectId) => ok(db.conversations.filter((c) => !projectId || c.projectId === projectId)),
      create: async (input) => {
        const c: AIConversation = { id: uid(), title: input.title, provider: input.provider, model: input.model, projectId: input.projectId ?? null, createdAt: new Date().toISOString() };
        db.conversations.unshift(c);
        save();
        return ok(c);
      },
      update: async (id, patch) => {
        const c = db.conversations.find((x) => x.id === id)!;
        Object.assign(c, patch);
        save();
        return ok(c);
      },
      delete: async (id) => {
        db.conversations = db.conversations.filter((c) => c.id !== id);
        db.messages = db.messages.filter((m) => m.conversationId !== id);
        save();
        return ok(undefined);
      },
    },
    messages: { list: (id) => ok(db.messages.filter((m) => m.conversationId === id)) },
    send: async (requestId, input) => {
      const conv = db.conversations.find((c) => c.id === input.conversationId)!;
      const isFirst = !db.messages.some((m) => m.conversationId === conv.id);
      db.messages.push({ id: uid(), conversationId: conv.id, role: "user", content: input.content, attachedFiles: input.attachedFiles ?? [], createdAt: new Date().toISOString() });
      if (isFirst) conv.title = input.content.split("\n")[0].slice(0, 60) || conv.title;
      save();
      void runStream(requestId, conv.provider, conv.model, answerFor(conv.provider, input.content, "chat"), "chat", (full) => {
        if (full.trim()) db.messages.push({ id: uid(), conversationId: conv.id, role: "assistant", content: full, attachedFiles: [], createdAt: new Date().toISOString() });
        save();
      });
      return ok(undefined, 30);
    },
    regenerate: async (requestId, conversationId) => {
      const conv = db.conversations.find((c) => c.id === conversationId)!;
      const msgs = db.messages.filter((m) => m.conversationId === conversationId);
      const lastUser = [...msgs].reverse().find((m) => m.role === "user");
      const lastIdx = db.messages.lastIndexOf(msgs[msgs.length - 1]);
      if (msgs[msgs.length - 1]?.role === "assistant") db.messages.splice(lastIdx, 1);
      save();
      void runStream(requestId, conv.provider, conv.model, answerFor(conv.provider, lastUser?.content ?? "", "chat"), "chat", (full) => {
        db.messages.push({ id: uid(), conversationId, role: "assistant", content: full, attachedFiles: [], createdAt: new Date().toISOString() });
        save();
      });
      return ok(undefined, 30);
    },
    interrupt: async (requestId) => {
      aborted.add(requestId);
      return ok(undefined, 0);
    },
    council: {
      run: async (input) => {
        for (const t of input.targets) void runStream(t.requestId, t.provider, t.model, answerFor(t.provider, input.prompt, "council"), "council");
        return ok(undefined, 30);
      },
      synthesize: async (input) => {
        void runStream(input.requestId, input.provider, input.model, answerFor(input.provider, input.prompt, "synthesis"), "synthesis");
        return ok(undefined, 30);
      },
    },
    onStream: (cb) => stream.on(cb),
    usage: {
      summary: (days) => ok(usageSummary(days)),
      clear: async () => {
        usage.length = 0;
        return ok(undefined);
      },
    },
  },
  commands: {
    assess: (command) => {
      const r = risk(command);
      return ok({ risk: r, reasons: r === "dangerous" ? ["Pode apagar ou sobrescrever arquivos."] : r === "safe" ? [] : ["Executa um programa no seu computador."], alwaysAllowed: db.allowedCommands.includes(command) && r !== "dangerous" });
    },
    run: async (input) => {
      if (input.decision === "always" && risk(input.command) !== "dangerous") db.allowedCommands.push(input.command);
      save();
      await wait(700);
      const c = input.command.trim();
      const stdout = /^git status/i.test(c)
        ? "On branch main\nChanges not staged for commit:\n  modified:   src/app/assinaturas/page.tsx"
        : /^npm run dev/i.test(c)
          ? "▲ Next.js 15\n- Local: http://localhost:3000\n✓ Ready in 1.2s"
          : `(demo) Comando simulado: ${c}\nNo app de verdade ele roda no PowerShell, na pasta do projeto.`;
      return ok({ exitCode: 0, stdout, stderr: "", timedOut: false });
    },
    listAllowed: () => ok(db.allowedCommands),
    revoke: async (command) => {
      db.allowedCommands = db.allowedCommands.filter((c) => c !== command);
      save();
      return ok(undefined);
    },
  },
  terminal: {
    available: () => ok(true),
    create: async (input) => {
      const id = uid();
      terms.set(id, { cwd: input.cwd, line: "" });
      setTimeout(() => termData.emit({ id, data: `\x1b[38;5;141mQyrex\x1b[0m · terminal de demonstração\r\nNo app desktop este é um PowerShell de verdade.\r\nTente: \x1b[36mdir\x1b[0m, \x1b[36mgit status\x1b[0m, \x1b[36mnpm run dev\x1b[0m${prompt(input.cwd)}` }), 150);
      return ok({ id, shell: "powershell", cwd: input.cwd });
    },
    write: async (id, data) => {
      const t = terms.get(id);
      if (!t) return ok(undefined, 0);
      for (const ch of data) {
        if (ch === "\r") {
          const line = t.line;
          t.line = "";
          termRun(id, line);
        } else if (ch === "\x7f") {
          if (t.line) {
            t.line = t.line.slice(0, -1);
            termData.emit({ id, data: "\b \b" });
          }
        } else if (ch >= " ") {
          t.line += ch;
          termData.emit({ id, data: ch });
        }
      }
      return ok(undefined, 0);
    },
    resize: () => ok(undefined, 0),
    kill: async (id) => {
      terms.delete(id);
      termExit.emit({ id, exitCode: 0 });
      return ok(undefined, 0);
    },
    // No navegador a demo não lê a área de transferência sem pedir permissão: cola nada.
    readClipboard: () => ok({ text: "", hasImage: false }, 0),
    agents: () => ok({ claude: true, codex: true }, 0),
    notifyDone: () => ok(undefined, 0),
    onData: (cb) => termData.on(cb),
    onExit: (cb) => termExit.on(cb),
  },
  integrations: {
    list: () =>
      ok<IntegrationStatus[]>([
        { id: "anthropic", state: "connected", detail: null, info: { authMode: "subscription", account: "Assinatura Pro (demo)" } },
        { id: "openai", state: "connected", detail: null, info: { authMode: "subscription", account: "ChatGPT" } },
        { id: "google", state: "connected", detail: null, info: { maskedKey: "AIza••••demo" } },
        { id: "github", state: "connected", detail: null, info: { login: "visitante-demo", maskedKey: "gho_••••demo" } },
        { id: "google_calendar", state: "connected", detail: null, info: { clientId: "demo.apps.googleusercontent.com", lastSync: new Date().toISOString() } },
        { id: "spotify", state: "disconnected", detail: null, info: {} },
        { id: "notion", state: "connected", detail: null, info: { workspace: "Workspace de exemplo", maskedKey: "ntn_••••demo" } },
        { id: "whatsapp", state: "connected", detail: null, info: {} },
      ]),
  },
  notion: {
    connect: () => fail("Na demo o Notion já vem conectado."),
    disconnect: () => fail("Na demo não é possível desconectar o Notion de exemplo."),
    test: () => ok({ ok: true }, 300),
    search: (query, kind) =>
      ok(
        notionPages
          .filter((p) => (!kind || p.type === kind) && p.title.toLowerCase().includes(query.trim().toLowerCase()))
          .sort((a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt))
          .map(notionItem),
        250
      ),
    page: (id) => {
      const p = notionPages.find((x) => x.id === id);
      return p ? ok({ ...notionItem(p), markdown: p.markdown, truncated: false }, 350) : fail("Notion: página não encontrada.");
    },
    createPage: async (input) => {
      const p = { id: crypto.randomUUID ? crypto.randomUUID() : uid(), type: "page" as const, title: input.title, icon: "📝", url: "https://www.notion.so", lastEditedAt: new Date().toISOString(), markdown: input.content ?? "" };
      notionPages.unshift(p);
      return ok(notionItem(p), 500);
    },
  },
  media: {
    state: () => ok(media(), 30),
    control: async (action) => {
      const p = position();
      if (action === "toggle" || action === "play" || action === "pause") {
        player.position = p;
        player.since = Date.now();
        player.playing = action === "toggle" ? !player.playing : action === "play";
      } else {
        player.index = (player.index + (action === "next" ? 1 : playlist.length - 1)) % playlist.length;
        player.position = 0;
        player.since = Date.now();
      }
      return ok(undefined);
    },
    seek: async (ms) => {
      player.position = ms;
      player.since = Date.now();
      return ok(undefined);
    },
  },
  spotify: {
    connect: () => fail("Na demo o player já mostra a música de exemplo."),
    disconnect: () => ok(undefined),
    playback: () => ok(null),
    control: () => ok(undefined),
    volume: () => ok(undefined),
    seek: () => ok(undefined),
  },
  googleCalendar: {
    connect: () => fail("Na demo o Google Agenda já vem conectado."),
    disconnect: () => ok(undefined),
    sync: () => ok(db.events.filter((e) => e.source === "google").length, 700),
  },
  updates: {
    status: () => ok({ state: "not-available" as const, version: APP_VERSION }),
    check: () => ok({ state: "not-available" as const, version: APP_VERSION }, 800),
    download: () => ok(undefined),
    install: () => ok(undefined),
    onStatus: () => () => undefined,
  },
  discord: {
    status: () => ok("connected" as const),
    setActivity: () => ok(undefined, 0),
    onStatus: () => () => undefined,
  },
  app: {
    onCommand: () => () => undefined,
    onNavigate: () => () => undefined,
  },
};
