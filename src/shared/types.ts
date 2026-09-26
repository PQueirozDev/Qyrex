// Tipos compartilhados entre main, preload e renderer.
// Mantidos num único lugar para garantir que o contrato IPC seja o mesmo dos dois lados.

export type TaskStatus = "pendente" | "em_andamento" | "concluido";
export type TaskPriority = "baixa" | "normal" | "alta" | "urgente";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  localPath: string;
  technologies: string[];
  githubUrl: string | null;
  clientId: string | null;
  favorite: boolean;
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string | null;
  clientId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  tags: string[];
  createdAt: string;
  completedAt: string | null;
}

export type ClientStatus = "ativo" | "inativo" | "prospecto";

export interface Client {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  notes: string | null;
  status: ClientStatus;
  monthlyValue: number | null;
  nextBillingDate: string | null;
  filesPath: string | null;
  createdAt: string;
}

export interface GitStatusInfo {
  branch: string | null;
  modifiedCount: number;
  isRepo: boolean;
  ahead: number;
  behind: number;
  remoteUrl: string | null;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
}

export interface GitChangedFile {
  status: string;
  path: string;
}

export interface ProjectWithGit extends Project {
  git: GitStatusInfo | null;
}

export interface ProjectDetection {
  name: string | null;
  technologies: string[];
  githubUrl: string | null;
  hasPackageJson: boolean;
  isGitRepo: boolean;
}

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

export type FilePreview =
  | { kind: "text"; language: string; content: string; truncated: boolean }
  | { kind: "image"; dataUrl: string }
  | { kind: "binary"; size: number }
  | { kind: "too_large"; size: number };

// --- Marketing ---------------------------------------------------------

export type MarketingContentType = "post" | "story" | "reel";
export type MarketingStatus = "ideia" | "produzindo" | "pronto" | "publicado";

export interface MarketingContent {
  id: string;
  clientId: string | null;
  type: MarketingContentType;
  title: string;
  description: string | null;
  caption: string | null;
  status: MarketingStatus;
  scheduledDate: string | null;
  files: string[];
  createdAt: string;
}

// --- Calendário ---------------------------------------------------------

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  source: "local" | "google";
  externalId: string | null;
  createdAt: string;
}

// --- Central de IA ---------------------------------------------------------

export type AIProviderId = "anthropic" | "openai" | "google";

export interface AIModelInfo {
  id: string;
  label: string;
}

/** Como o provider está conectado: API key ou a assinatura (Claude Code / Codex CLI). */
export type AIAuthMode = "key" | "subscription";

export interface AIProviderStatus {
  id: AIProviderId;
  label: string;
  connected: boolean;
  authMode: AIAuthMode;
  /** Conta da assinatura (ex.: e-mail do Claude, "ChatGPT"). */
  account: string | null;
  maskedKey: string | null;
  models: AIModelInfo[];
  defaultModel: string;
}

export type AIMessageRole = "user" | "assistant" | "system";

export interface AIConversation {
  id: string;
  title: string;
  provider: AIProviderId;
  model: string;
  projectId: string | null;
  createdAt: string;
}

export interface AttachedFileRef {
  path: string;
  name: string;
}

export interface AIMessage {
  id: string;
  conversationId: string;
  role: AIMessageRole;
  content: string;
  attachedFiles: AttachedFileRef[];
  createdAt: string;
}

export interface AIStreamChunk {
  requestId: string;
  type: "delta" | "done" | "error";
  text?: string;
  error?: string;
}

/** Situação das CLIs de assinatura neste PC (Integrações). */
export interface SubscriptionCliStatus {
  provider: "anthropic" | "openai";
  cli: "claude" | "codex";
  installed: boolean;
  loggedIn: boolean;
  account: string | null;
}

// --- Música tocando no PC (sessões de mídia do Windows) --------------------------

export type MediaAction = "play" | "pause" | "toggle" | "next" | "previous";

export interface LocalMediaState {
  /** App que está tocando (ex.: "Spotify.exe"). */
  app: string;
  isSpotify: boolean;
  title: string;
  artist: string;
  album: string;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  canNext: boolean;
  canPrevious: boolean;
  canSeek: boolean;
  coverUrl: string | null;
}

export interface CouncilTarget {
  provider: AIProviderId;
  model: string;
}

// --- Segurança de comandos ------------------------------------------------

export type CommandRisk = "safe" | "normal" | "dangerous";

export interface CommandAssessment {
  risk: CommandRisk;
  reasons: string[];
}

export interface CommandRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

// --- Integrações ------------------------------------------------------------

export type IntegrationId =
  | "anthropic"
  | "openai"
  | "google"
  | "github"
  | "google_calendar"
  | "spotify"
  | "notion"
  | "whatsapp";

export type IntegrationState = "connected" | "disconnected" | "error";

export interface IntegrationStatus {
  id: IntegrationId;
  state: IntegrationState;
  detail: string | null;
  /** Dados não sensíveis (ex.: login do GitHub, client ID público do OAuth). */
  info: Record<string, string>;
}

// --- GitHub -----------------------------------------------------------------

export interface GitHubRepoInfo {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  openIssues: number;
  htmlUrl: string;
  private: boolean;
}

export interface GitHubItem {
  number: number;
  title: string;
  state: string;
  author: string;
  htmlUrl: string;
  updatedAt: string;
}

export interface GitHubOverview {
  repo: GitHubRepoInfo;
  issues: GitHubItem[];
  pulls: GitHubItem[];
}

// --- Notion ------------------------------------------------------------------

export interface NotionItem {
  id: string;
  type: "page" | "database";
  title: string;
  /** Emoji do ícone, quando houver. */
  icon: string | null;
  url: string;
  lastEditedAt: string;
}

export interface NotionPageContent {
  id: string;
  title: string;
  icon: string | null;
  url: string;
  lastEditedAt: string;
  /** Conteúdo convertido para Markdown (somente leitura). */
  markdown: string;
  /** true quando a página era grande e só o começo foi carregado. */
  truncated: boolean;
}

// --- Spotify ----------------------------------------------------------------

export interface SpotifyPlayback {
  isPlaying: boolean;
  track: string;
  artists: string;
  album: string;
  coverUrl: string | null;
  progressMs: number;
  durationMs: number;
  volumePercent: number | null;
  deviceName: string | null;
}

// --- Busca / Atividade --------------------------------------------------------

export interface SearchResults {
  projects: Project[];
  tasks: Task[];
  clients: Client[];
  marketing: MarketingContent[];
  files: DirEntry[];
}

export type RecentItemType = "project" | "file" | "task_completed" | "client" | "commit";

export interface RecentItem {
  id: string;
  itemType: RecentItemType;
  itemId: string;
  label: string;
  openedAt: string;
}

// --- Configurações ------------------------------------------------------------

export interface NotificationPrefs {
  tasks: boolean;
  events: boolean;
  billing: boolean;
  marketing: boolean;
}

export type ThemeId = "dark" | "light" | "midnight" | "violet" | "sand";
export type Language = "pt" | "en";

export interface DiscordPrefs {
  enabled: boolean;
  /** ID público do aplicativo criado no Discord Developer Portal. */
  clientId: string | null;
  /** Mostrar o nome do projeto aberto (desligado por padrão: pode ser de cliente). */
  showProject: boolean;
}

export interface AppSettings {
  userName: string;
  theme: ThemeId | "system";
  language: Language;
  discord: DiscordPrefs;
  autoUpdate: boolean;
  lastSeenVersion: string | null;
  startWithSystem: boolean;
  minimizeToTray: boolean;
  allowedProjectDirs: string[];
  defaultTerminal: "powershell" | "cmd";
  aiDefaultProvider: AIProviderId | null;
  aiDefaultModel: string | null;
  notifications: NotificationPrefs;
  onboardingCompleted: boolean;
  vscodePath: string | null;
}

export interface SystemInfo {
  platform: string;
  appVersion: string;
  vscodePath: string | null;
  logsDir: string | null;
  terminalAvailable: boolean;
}

// Toda ação potencialmente sensível passa por essa confirmação antes de ser executada.
export interface ConfirmationRequest {
  id: string;
  title: string;
  description: string;
  level: "normal" | "sensitive";
}

/** Comandos que o main process pede para o renderer executar (tray, atalhos). */
export type AppCommand = "new-task" | "open-projects" | "open-ai" | "open-palette";

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

// --- Atualizações -------------------------------------------------------------

export type UpdateStatus =
  | { state: "idle" }
  | { state: "disabled"; reason: string }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string };

// --- Discord ----------------------------------------------------------------------

export type DiscordStatus = "disabled" | "connecting" | "connected" | "discord-not-running" | "error";

// --- Uso da IA ------------------------------------------------------------------

export type AIUsageSource = "chat" | "council" | "synthesis";

export interface AIUsageRecord {
  id: string;
  createdAt: string;
  provider: AIProviderId;
  model: string;
  source: AIUsageSource;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** true quando o provider não informou o uso e os tokens foram estimados (~4 caracteres/token). */
  estimated: boolean;
  aborted: boolean;
  /** Custo estimado em US$ (null quando o preço do modelo não é conhecido). */
  costUsd: number | null;
}

export interface AIUsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  /** Requisições cujo custo não pôde ser estimado (modelo sem preço conhecido). */
  unpricedRequests: number;
}

export interface AIUsageSummary {
  days: number | null;
  totals: AIUsageTotals;
  byModel: (AIUsageTotals & { provider: AIProviderId; model: string })[];
  byDay: { date: string; inputTokens: number; outputTokens: number; costUsd: number; byProvider: Record<string, number> }[];
  recent: AIUsageRecord[];
}
