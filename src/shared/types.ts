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
  /** "auto": ícone/logo detectado na pasta; "custom": imagem escolhida; "none": só as iniciais. */
  iconMode: ProjectIconMode;
  status: ProjectStatus;
  /** Preenchido quando o projeto foi arquivado (some do dia a dia, mas nada é apagado). */
  archivedAt: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
}

export type ProjectIconMode = "auto" | "custom" | "none";
export type ProjectStatus = "ativo" | "pausado" | "concluido";

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
  /** Branch remota acompanhada (ex.: origin/main); null = ainda não publicada. */
  upstream: string | null;
  /** Arquivos com conflito de merge não resolvido. */
  conflicts: number;
  /** Merge/rebase/cherry-pick parado no meio. */
  operation: GitOperation | null;
}

export type GitOperation = "merge" | "rebase" | "cherry-pick";

export interface GitBranch {
  name: string;
  current: boolean;
  upstream: string | null;
  lastCommitAt: string | null;
}

export interface GitDiff {
  file: string;
  /** Diff unificado (vazio para binários e arquivos grandes demais). */
  diff: string;
  truncated: boolean;
  binary: boolean;
  untracked: boolean;
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
  /** Caminho anterior numa renomeação/cópia. */
  oldPath: string | null;
  staged: boolean;
  untracked: boolean;
  conflict: boolean;
}

export interface ProjectWithGit extends Project {
  git: GitStatusInfo | null;
  /** Ícone já resolvido conforme `iconMode`, como data URL (null = usar as iniciais). */
  icon: string | null;
}

export interface ProjectDetection {
  name: string | null;
  technologies: string[];
  githubUrl: string | null;
  hasPackageJson: boolean;
  isGitRepo: boolean;
  /** Ícone/logo do app encontrado na pasta (data URL). */
  icon: string | null;
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

/** Arquivo de texto aberto no editor embutido. */
export interface EditableFile {
  path: string;
  content: string;
  /** mtime lido do disco — o save compara para detectar alteração externa. */
  mtimeMs: number;
  size: number;
  /** O arquivo começava com BOM UTF-8 (é preservado ao salvar). */
  bom: boolean;
  eol: "\n" | "\r\n";
}

/** `conflict`: o arquivo mudou no disco desde que foi aberto (nada foi gravado). */
export type SaveFileResult =
  | { status: "saved"; mtimeMs: number; size: number }
  | { status: "conflict"; mtimeMs: number };

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

/** Uma janela de limite da assinatura (ex.: sessão de 5h, semana). */
export interface SubscriptionLimitWindow {
  /** "session" (5h), "week" (todos os modelos) ou "model" (semana de um modelo, ex.: Opus). */
  kind: "session" | "week" | "model";
  /** Nome do modelo quando kind = "model". */
  label: string | null;
  usedPercent: number;
  /** ISO; null quando a janela ainda não começou. */
  resetsAt: string | null;
}

/** Uso atual da assinatura de um agente de código logado no PC (Claude Code / Codex). */
export interface SubscriptionLimits {
  provider: "anthropic" | "openai";
  cli: "claude" | "codex";
  /** false = CLI não instalada ou não logada (a UI esconde). */
  available: boolean;
  plan: string | null;
  windows: SubscriptionLimitWindow[];
  /** Resets grátis de limite disponíveis (Codex). */
  resetCredits: number | null;
  /** O provedor avisou que o limite foi atingido. */
  limited: boolean;
  error: string | null;
  fetchedAt: string;
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

export type RecentItemType = "project" | "file" | "task_completed" | "client" | "commit" | "focus" | "automation";

// --- Automações -------------------------------------------------------------------

export type AutomationStep =
  | { kind: "command"; command: string }
  | { kind: "open"; target: "vscode" | "explorer" | "terminal" };

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  /** Passos com o risco recalculado pelo main a cada leitura. */
  steps: (AutomationStep & { assessment: CommandAssessment })[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRun: AutomationRun | null;
}

export type AutomationStepStatus = "pending" | "running" | "success" | "failed" | "skipped" | "cancelled";

export interface AutomationStepResult {
  step: AutomationStep;
  status: AutomationStepStatus;
  exitCode: number | null;
  /** Fim da saída (os últimos ~20 mil caracteres). */
  stdout: string;
  stderr: string;
  durationMs: number;
  risk: CommandRisk;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "failed" | "cancelled";
  steps: AutomationStepResult[];
  error: string | null;
}

export interface AutomationSuggestion {
  name: string;
  description: string | null;
  steps: AutomationStep[];
}

// --- Foco ------------------------------------------------------------------------

export type FocusStatus = "running" | "paused" | "completed" | "cancelled";

export interface FocusSession {
  id: string;
  projectId: string | null;
  taskId: string | null;
  label: string | null;
  plannedMinutes: number;
  startedAt: string;
  endedAt: string | null;
  /** Segundos já contados (sem o trecho que está rodando agora). */
  focusedSeconds: number;
  /** Início do trecho atual quando está rodando. */
  resumedAt: string | null;
  status: FocusStatus;
}

export interface FocusState {
  session: FocusSession | null;
  /** Segundos focados até o momento da leitura (nunca passa do planejado). */
  elapsedSeconds: number;
}

export interface FocusSummary {
  days: { day: string; seconds: number }[];
  todaySeconds: number;
  totalSeconds: number;
  completedSessions: number;
  byProject: { projectId: string | null; name: string | null; seconds: number }[];
  recent: (FocusSession & { projectName: string | null })[];
  dailyGoalMinutes: number;
}

export const DASHBOARD_WIDGETS = ["agenda", "tarefas", "atividade", "foco", "projetos", "automacoes", "cobrancas"] as const;
export type DashboardWidgetId = (typeof DASHBOARD_WIDGETS)[number];

export interface DashboardPrefs {
  /** Ordem escolhida (widgets que faltarem entram no fim, na ordem padrão). */
  order: DashboardWidgetId[];
  hidden: DashboardWidgetId[];
}

export interface FocusPrefs {
  /** Duração padrão de uma sessão, em minutos. */
  minutes: number;
  /** Meta diária opcional (0 = sem meta). */
  dailyGoalMinutes: number;
  /** Notificação do Windows ao terminar uma sessão. */
  notify: boolean;
}

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

/** Backup local automático (Configurações → Backup). */
export interface BackupPrefs {
  auto: boolean;
  /** Intervalo mínimo entre backups automáticos, em dias. */
  intervalDays: number;
  /** Quantos backups automáticos guardar (os manuais nunca são apagados sozinhos). */
  keep: number;
}

export type BackupKind = "manual" | "auto" | "pre-restore" | "pre-migration";

export interface BackupInfo {
  id: string;
  kind: BackupKind;
  createdAt: string;
  appVersion: string;
  /** Migrations aplicadas no banco copiado (diz de que versão do esquema ele é). */
  migrations: string[];
  sizeBytes: number;
  sha256: string;
  /** Arquivos do Qyrex copiados junto (foto de perfil, ícones de projeto). */
  extraFiles: number;
  valid: boolean;
  /** Motivo de o backup ser inválido (arquivo faltando, hash diferente, banco corrompido...). */
  problem: string | null;
}

/** Arquivo de configurações exportado (sem segredos e sem pastas autorizadas). */
export interface SettingsImport {
  file: string;
  exportedAt: string | null;
  appVersion: string | null;
  patch: Partial<AppSettings>;
}

export type ThemeId = "dark" | "light" | "midnight" | "violet" | "sand" | "onsen";
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
  /** Libera o acesso a todas as pastas do PC (as raízes passam a ser as unidades). */
  allowAllDirs: boolean;
  defaultTerminal: "powershell" | "cmd";
  aiDefaultProvider: AIProviderId | null;
  aiDefaultModel: string | null;
  notifications: NotificationPrefs;
  onboardingCompleted: boolean;
  /** Animação de abertura (logo + nome) ao abrir a janela. */
  splashAnimation: boolean;
  /** Modo Negócio: mostra clientes, marketing e WhatsApp. Desligado = modo Dev (padrão). */
  businessMode: boolean;
  backup: BackupPrefs;
  focus: FocusPrefs;
  dashboard: DashboardPrefs;
  vscodePath: string | null;
}

export interface SystemInfo {
  platform: string;
  appVersion: string;
  vscodePath: string | null;
  logsDir: string | null;
  terminalAvailable: boolean;
  /** Unidades do PC (C:\, D:\...), usadas como raízes quando todas as pastas estão liberadas. */
  driveRoots: string[];
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

/** Tempo com o Qyrex aberto e em uso num dia (data local AAAA-MM-DD). */
export interface AppUsageDay {
  day: string;
  seconds: number;
  sessions: number;
}

export interface AppUsageSummary {
  /** Dias do período pedido, do mais antigo ao mais recente (dias sem uso vêm com 0). */
  days: AppUsageDay[];
  todaySeconds: number;
  totalSeconds: number;
  activeDays: number;
  /** Dias seguidos com uso até hoje (ou até ontem, se hoje ainda não contou). */
  currentStreak: number;
  longestStreak: number;
  /** Primeiro dia registrado (todo o histórico), ou null se ainda não há registro. */
  firstDay: string | null;
}

export interface AIUsageSummary {
  days: number | null;
  totals: AIUsageTotals;
  byModel: (AIUsageTotals & { provider: AIProviderId; model: string })[];
  byDay: { date: string; inputTokens: number; outputTokens: number; costUsd: number; byProvider: Record<string, number> }[];
  recent: AIUsageRecord[];
}
