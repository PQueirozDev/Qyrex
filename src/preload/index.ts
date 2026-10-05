import { contextBridge, ipcRenderer } from "electron";
import type {
  AIConversation,
  AIMessage,
  AIProviderId,
  AIProviderStatus,
  AIStreamChunk,
  AIUsageSummary,
  AppUsageSummary,
  AppCommand,
  AppSettings,
  AttachedFileRef,
  CalendarEvent,
  Client,
  CommandAssessment,
  CommandRunResult,
  DiscordStatus,
  LocalMediaState,
  MediaAction,
  NotionItem,
  NotionPageContent,
  SubscriptionCliStatus,
  UpdateStatus,
  DirEntry,
  EditableFile,
  FilePreview,
  SaveFileResult,
  GitChangedFile,
  GitCommit,
  GitHubOverview,
  GitStatusInfo,
  IntegrationStatus,
  IpcResult,
  MarketingContent,
  Project,
  ProjectDetection,
  ProjectWithGit,
  RecentItem,
  SearchResults,
  SpotifyPlayback,
  SystemInfo,
  SubscriptionLimits,
  Task,
  TaskStatus,
} from "../shared/types.js";

/**
 * Esta é a ÚNICA ponte entre o processo isolado do renderer e o main process.
 * O renderer nunca tem acesso a `require`, `fs`, `child_process` etc — apenas
 * às funções explicitamente expostas aqui, cada uma mapeada 1:1 para um
 * canal IPC validado em `src/main/ipc/handlers.ts`.
 */

type R<T> = Promise<IpcResult<T>>;
const invoke = <T>(channel: string, ...args: unknown[]): R<T> => ipcRenderer.invoke(channel, ...args) as R<T>;

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

type TaskInput = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Task["priority"];
  projectId?: string;
  clientId?: string;
  dueDate?: string;
  dueTime?: string;
  tags?: string[];
};

type ClientInput = Partial<Omit<Client, "id" | "createdAt">>;
type MarketingInput = Partial<Omit<MarketingContent, "id" | "createdAt">>;

const api = {
  settings: {
    get: () => invoke<AppSettings>("settings:get"),
    update: (patch: Partial<Omit<AppSettings, "allowedProjectDirs" | "vscodePath">>) => invoke<AppSettings>("settings:update", patch),
    /** Sem argumento: abre o seletor de pastas nativo. */
    addAllowedDir: (dir?: string) => invoke<AppSettings>("settings:addAllowedDir", dir),
    removeAllowedDir: (dir: string) => invoke<AppSettings>("settings:removeAllowedDir", dir),
  },
  profile: {
    /** Foto de perfil como data URL, ou null se não houver. */
    getAvatar: () => invoke<string | null>("profile:getAvatar"),
    /** Abre o seletor de imagens; devolve a foto nova ou null se cancelar. */
    pickAvatar: () => invoke<string | null>("profile:pickAvatar"),
    removeAvatar: () => invoke<null>("profile:removeAvatar"),
  },
  appUsage: {
    /** Tempo de uso do Qyrex por dia nos últimos `days` dias (1 a 366). */
    summary: (days: number) => invoke<AppUsageSummary>("appUsage:summary", days),
  },
  system: {
    info: () => invoke<SystemInfo>("system:info"),
    /** Memória usada pelo app (todos os processos), em MB. */
    memory: () => invoke<number>("system:memory"),
    setTitleBarColors: (colors: { color: string; symbolColor: string }) => invoke<void>("system:setTitleBarColors", colors),
    openVSCode: (p: string) => invoke<void>("system:openVSCode", p),
    openExplorer: (p: string) => invoke<void>("system:openExplorer", p),
    openFile: (p: string) => invoke<void>("system:openFile", p),
    openTerminal: (p: string, shell?: "powershell" | "cmd") => invoke<void>("system:openTerminal", p, shell),
    openExternalUrl: (url: string) => invoke<void>("system:openExternalUrl", url),
    pickDirectory: (title?: string) => invoke<string | null>("system:pickDirectory", title),
    pickVSCode: () => invoke<string | null>("system:pickVSCode"),
    detectVSCode: () => invoke<string | null>("system:detectVSCode"),
    openLogs: () => invoke<void>("system:openLogs"),
    openWhatsApp: (target: "desktop" | "web") => invoke<void>("system:openWhatsApp", target),
    whatsappStatus: () => invoke<{ desktopInstalled: boolean }>("system:whatsappStatus"),
    openWhatsAppChat: (input: { phone: string; message?: string }, preferDesktop: boolean) =>
      invoke<void>("system:openWhatsAppChat", input, preferDesktop),
    whatsappUrl: (input: { phone: string; message?: string }) => invoke<string>("system:whatsappUrl", input),
    openSpotifyApp: () => invoke<void>("system:openSpotifyApp"),
  },
  projects: {
    list: () => invoke<ProjectWithGit[]>("projects:list"),
    detect: (p: string) => invoke<ProjectDetection>("projects:detect", p),
    create: (input: {
      name: string;
      description?: string;
      localPath: string;
      technologies?: string[];
      githubUrl?: string;
      clientId?: string;
    }) => invoke<Project>("projects:create", input),
    update: (id: string, patch: Partial<Pick<Project, "name" | "description" | "technologies" | "githubUrl" | "clientId">>) =>
      invoke<Project>("projects:update", id, patch),
    toggleFavorite: (id: string) => invoke<void>("projects:toggleFavorite", id),
    touchOpened: (id: string) => invoke<void>("projects:touchOpened", id),
    delete: (id: string) => invoke<void>("projects:delete", id),
  },
  git: {
    status: (p: string) => invoke<GitStatusInfo>("git:status", p),
    commits: (p: string, limit?: number) => invoke<GitCommit[]>("git:commits", p, limit),
    changes: (p: string) => invoke<GitChangedFile[]>("git:changes", p),
    commit: (input: { projectPath: string; message: string; stageAll: boolean; confirmed: true }) =>
      invoke<string>("git:commit", input),
    pull: (input: { projectPath: string; confirmed: true }) => invoke<string>("git:pull", input),
    push: (input: { projectPath: string; confirmed: true }) => invoke<string>("git:push", input),
  },
  github: {
    overview: (url: string) => invoke<GitHubOverview>("github:overview", url),
    connect: (token: string) => invoke<{ login: string }>("github:connect", token),
    ghCliAvailable: () => invoke<boolean>("github:ghCliAvailable"),
    connectGhCli: () => invoke<{ login: string }>("github:connectGhCli"),
    disconnect: () => invoke<void>("github:disconnect"),
    test: () => invoke<{ ok: boolean; error?: string }>("github:test"),
  },
  tasks: {
    list: (filter?: { status?: TaskStatus; projectId?: string; clientId?: string }) => invoke<Task[]>("tasks:list", filter),
    create: (input: TaskInput) => invoke<Task>("tasks:create", input),
    update: (id: string, patch: Partial<Omit<Task, "id" | "createdAt" | "completedAt">>) => invoke<Task>("tasks:update", id, patch),
    delete: (id: string) => invoke<void>("tasks:delete", id),
  },
  files: {
    list: (dir: string) => invoke<DirEntry[]>("files:list", dir),
    createFolder: (dir: string, name: string) => invoke<DirEntry>("files:createFolder", dir, name),
    rename: (p: string, newName: string) => invoke<string>("files:rename", p, newName),
    copy: (source: string, destDir: string) => invoke<string>("files:copy", source, destDir),
    move: (source: string, destDir: string, confirmed: boolean) => invoke<string>("files:move", source, destDir, confirmed),
    delete: (p: string, confirmed: boolean) => invoke<void>("files:delete", p, confirmed),
    preview: (p: string) => invoke<FilePreview>("files:preview", p),
    readForEdit: (p: string) => invoke<EditableFile>("files:readForEdit", p),
    save: (input: { path: string; content: string; expectedMtimeMs: number | null; bom: boolean; force: boolean }) =>
      invoke<SaveFileResult>("files:save", input),
    createFile: (dir: string, name: string) => invoke<DirEntry>("files:createFile", dir, name),
    search: (query: string, root?: string) => invoke<DirEntry[]>("files:search", query, root),
    isAllowed: (p: string) => invoke<boolean>("files:isAllowed", p),
  },
  search: {
    global: (query: string) => invoke<SearchResults>("search:global", query),
  },
  activity: {
    list: (limit?: number) => invoke<RecentItem[]>("activity:list", limit),
  },
  clients: {
    list: (search?: string) => invoke<Client[]>("clients:list", search),
    get: (id: string) => invoke<Client | null>("clients:get", id),
    create: (input: ClientInput & { name: string }) => invoke<Client>("clients:create", input),
    update: (id: string, patch: ClientInput) => invoke<Client>("clients:update", id, patch),
    delete: (id: string) => invoke<void>("clients:delete", id),
  },
  marketing: {
    list: (filter?: { clientId?: string; from?: string; to?: string }) => invoke<MarketingContent[]>("marketing:list", filter),
    create: (input: {
      title: string;
      type: MarketingContent["type"];
      clientId?: string;
      description?: string;
      caption?: string;
      status?: MarketingContent["status"];
      scheduledDate?: string;
      files?: string[];
    }) => invoke<MarketingContent>("marketing:create", input),
    update: (id: string, patch: MarketingInput) => invoke<MarketingContent>("marketing:update", id, patch),
    delete: (id: string) => invoke<void>("marketing:delete", id),
  },
  calendar: {
    list: (range?: { from: string; to: string }) => invoke<CalendarEvent[]>("calendar:list", range),
    create: (input: { title: string; description?: string; startsAt: string; endsAt?: string; location?: string }) =>
      invoke<CalendarEvent>("calendar:create", input),
    update: (id: string, patch: Partial<Pick<CalendarEvent, "title" | "description" | "startsAt" | "endsAt" | "location">>) =>
      invoke<CalendarEvent>("calendar:update", id, patch),
    delete: (id: string) => invoke<void>("calendar:delete", id),
  },
  ai: {
    providers: () => invoke<AIProviderStatus[]>("ai:providers"),
    refreshModels: (provider: AIProviderId) => invoke<AIProviderStatus[]>("ai:refreshModels", provider),
    connect: (provider: AIProviderId, apiKey: string) => invoke<{ ok: boolean; error?: string }>("ai:connect", provider, apiKey),
    disconnect: (provider: AIProviderId) => invoke<void>("ai:disconnect", provider),
    test: (provider: AIProviderId) => invoke<{ ok: boolean; error?: string }>("ai:test", provider),
    subscriptions: () => invoke<SubscriptionCliStatus[]>("ai:subscriptions:list"),
    /** Uso atual da assinatura (5h / semana) do Claude Code e do Codex. `force` ignora o cache de 1 min. */
    limits: (force?: boolean) => invoke<SubscriptionLimits[]>("ai:limits", force),
    connectSubscription: (provider: "anthropic" | "openai") =>
      invoke<{ ok: boolean; error?: string; account?: string | null }>("ai:connectSubscription", provider),
    conversations: {
      list: (projectId?: string) => invoke<AIConversation[]>("ai:conversations:list", projectId),
      create: (input: { title: string; provider: AIProviderId; model: string; projectId?: string }) =>
        invoke<AIConversation>("ai:conversations:create", input),
      update: (id: string, patch: { title?: string; model?: string; provider?: AIProviderId }) =>
        invoke<AIConversation>("ai:conversations:update", id, patch),
      delete: (id: string) => invoke<void>("ai:conversations:delete", id),
    },
    messages: {
      list: (conversationId: string) => invoke<AIMessage[]>("ai:messages:list", conversationId),
    },
    send: (requestId: string, input: { conversationId: string; content: string; attachedFiles?: AttachedFileRef[] }) =>
      invoke<void>("ai:send", requestId, input),
    regenerate: (requestId: string, conversationId: string) => invoke<void>("ai:regenerate", requestId, conversationId),
    interrupt: (requestId: string) => invoke<void>("ai:interrupt", requestId),
    council: {
      run: (input: {
        prompt: string;
        targets: { provider: AIProviderId; model: string; requestId: string }[];
        attachedFiles?: AttachedFileRef[];
        confirmedCount: number;
      }) => invoke<void>("ai:council:run", input),
      synthesize: (input: {
        requestId: string;
        provider: AIProviderId;
        model: string;
        prompt: string;
        answers: { label: string; content: string }[];
      }) => invoke<void>("ai:council:synthesize", input),
    },
    onStream: (callback: (chunk: AIStreamChunk) => void) => subscribe<AIStreamChunk>("ai:stream", callback),
    usage: {
      /** days: 1 = hoje, 7, 30...; null = todo o histórico. */
      summary: (days: number | null) => invoke<AIUsageSummary>("ai:usage:summary", days),
      clear: (confirmed: boolean) => invoke<void>("ai:usage:clear", confirmed),
    },
  },
  commands: {
    assess: (command: string) => invoke<CommandAssessment & { alwaysAllowed: boolean }>("commands:assess", command),
    run: (input: { command: string; cwd: string; decision: "once" | "always"; confirmed: true }) =>
      invoke<CommandRunResult>("commands:run", input),
    listAllowed: () => invoke<string[]>("commands:listAllowed"),
    revoke: (command: string) => invoke<void>("commands:revoke", command),
  },
  terminal: {
    available: () => invoke<boolean>("terminal:available"),
    create: (input: { cwd: string; shell?: "powershell" | "cmd" | "claude" | "codex"; cols: number; rows: number }) =>
      invoke<{ id: string; shell: string; cwd: string }>("terminal:create", input),
    /** Agentes instalados que podem abrir no terminal. */
    agents: () => invoke<{ claude: boolean; codex: boolean }>("terminal:agents"),
    /** Aviso do Windows: o terminal terminou o trabalho fora da vista do usuário. */
    notifyDone: (id: string) => invoke<void>("terminal:notifyDone", id),
    write: (id: string, data: string) => invoke<void>("terminal:write", id, data),
    resize: (id: string, cols: number, rows: number) => invoke<void>("terminal:resize", id, cols, rows),
    kill: (id: string) => invoke<void>("terminal:kill", id),
    readClipboard: () => invoke<{ text: string; hasImage: boolean }>("terminal:clipboard"),
    onData: (callback: (payload: { id: string; data: string }) => void) => subscribe("terminal:data", callback),
    onExit: (callback: (payload: { id: string; exitCode: number }) => void) => subscribe("terminal:exit", callback),
  },
  integrations: {
    list: () => invoke<IntegrationStatus[]>("integrations:list"),
  },
  notion: {
    connect: (token: string) => invoke<{ workspace: string }>("notion:connect", token),
    disconnect: () => invoke<void>("notion:disconnect"),
    test: () => invoke<{ ok: boolean; error?: string }>("notion:test"),
    search: (query: string, kind?: "page" | "database") => invoke<NotionItem[]>("notion:search", query, kind),
    page: (id: string) => invoke<NotionPageContent>("notion:page", id),
    createPage: (input: { parentId: string; parentType: "page" | "database"; title: string; content?: string }) =>
      invoke<NotionItem>("notion:createPage", input),
  },
  media: {
    state: () => invoke<LocalMediaState | null>("media:state"),
    control: (action: MediaAction) => invoke<void>("media:control", action),
    seek: (ms: number) => invoke<void>("media:seek", ms),
  },
  spotify: {
    connect: (clientId: string) => invoke<void>("spotify:connect", { clientId }),
    disconnect: () => invoke<void>("spotify:disconnect"),
    playback: () => invoke<SpotifyPlayback | null>("spotify:playback"),
    control: (action: "play" | "pause" | "next" | "previous") => invoke<void>("spotify:control", action),
    volume: (percent: number) => invoke<void>("spotify:volume", percent),
    seek: (ms: number) => invoke<void>("spotify:seek", ms),
  },
  googleCalendar: {
    connect: (clientId: string, clientSecret: string) => invoke<void>("googleCalendar:connect", { clientId, clientSecret }),
    disconnect: () => invoke<void>("googleCalendar:disconnect"),
    sync: () => invoke<number>("googleCalendar:sync"),
  },
  updates: {
    status: () => invoke<UpdateStatus>("update:status"),
    check: (download: boolean) => invoke<UpdateStatus>("update:check", download),
    download: () => invoke<void>("update:download"),
    install: () => invoke<void>("update:install"),
    onStatus: (callback: (status: UpdateStatus) => void) => subscribe<UpdateStatus>("update:status", callback),
  },
  discord: {
    status: () => invoke<DiscordStatus>("discord:status"),
    setActivity: (page: string, project?: string | null) => invoke<void>("discord:setActivity", page, project ?? null),
    onStatus: (callback: (status: DiscordStatus) => void) => subscribe<DiscordStatus>("discord:status", callback),
  },
  app: {
    onCommand: (callback: (command: AppCommand) => void) => subscribe<AppCommand>("app:command", callback),
    onNavigate: (callback: (page: string) => void) => subscribe<string>("app:navigate", callback),
  },
};

contextBridge.exposeInMainWorld("workspace", api);

export type WorkspaceApi = typeof api;
