import { z } from "zod";
import { currentLanguage, tt } from "../i18n.js";
import { tm } from "../../shared/i18n.js";
import { DASHBOARD_WIDGETS } from "../../shared/types.js";

/**
 * Schemas de validação de TODO input que chega do renderer via IPC.
 * O renderer é tratado como não confiável: qualquer campo extra é descartado
 * (z.object remove chaves desconhecidas) e qualquer tipo errado é rejeitado
 * antes de chegar aos services.
 */

const MAX_TEXT = 20_000;

export const id = z.string().min(1).max(128);
export const nonEmpty = (max = 500) => z.string().trim().min(1).max(max);
const optionalText = (max = MAX_TEXT) =>
  z
    .string()
    .max(max)
    .transform((v) => (v.trim() === "" ? undefined : v.trim()))
    .optional();
const nullableText = (max = MAX_TEXT) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((v) => (v === null || v.trim() === "" ? null : v.trim()));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)");
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido (use HH:MM)");
export const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/, "Data/hora inválida");
export const filePath = z.string().min(1).max(4096);

/** Save do editor embutido. O texto pode ter até ~5 MB (MAX_EDITABLE_BYTES). */
export const fileSave = z.object({
  path: filePath,
  // Limite grosso em caracteres; o service confere o tamanho real em bytes.
  content: z.string().max(5 * 1024 * 1024, "Arquivo grande demais para o editor."),
  expectedMtimeMs: z.number().finite().nonnegative().nullable(),
  bom: z.boolean(),
  force: z.boolean(),
});

export const taskStatus = z.enum(["pendente", "em_andamento", "concluido"]);
export const taskPriority = z.enum(["baixa", "normal", "alta", "urgente"]);
export const clientStatus = z.enum(["ativo", "inativo", "prospecto"]);
export const marketingType = z.enum(["post", "story", "reel"]);
export const marketingStatus = z.enum(["ideia", "produzindo", "pronto", "publicado"]);
export const aiProvider = z.enum(["anthropic", "openai", "google"]);
export const integrationId = z.enum(["anthropic", "openai", "google", "github", "google_calendar", "spotify", "notion", "whatsapp"]);

/** ID de página/banco do Notion (UUID, com ou sem hífens). */
export const notionId = z.string().regex(/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i, "ID do Notion inválido");

export const notionCreatePage = z.object({
  parentId: notionId,
  parentType: z.enum(["page", "database"]),
  title: z.string().trim().min(1, "Dê um título à página").max(200),
  content: z.string().max(40_000).optional(),
});

const tags = z.array(z.string().trim().min(1).max(40)).max(20);
const url = z.string().url().max(2048);

// --- Settings ---
export const settingsPatch = z
  .object({
    userName: z.string().trim().max(60),
    theme: z.enum(["dark", "light", "system", "midnight", "violet", "sand", "onsen"]),
    language: z.enum(["pt", "en"]),
    autoUpdate: z.boolean(),
    lastSeenVersion: z.string().regex(/^\d+\.\d+\.\d+([-+][\w.]+)?$/).nullable(),
    discord: z.object({
      enabled: z.boolean(),
      // ID público de aplicativo do Discord (snowflake numérico).
      clientId: z
        .string()
        .trim()
        .regex(/^\d{17,20}$/, "Client ID do Discord inválido (são 17 a 20 dígitos)")
        .nullable()
        .or(z.literal("").transform(() => null)),
      showProject: z.boolean(),
    }),
    startWithSystem: z.boolean(),
    minimizeToTray: z.boolean(),
    defaultTerminal: z.enum(["powershell", "cmd"]),
    aiDefaultProvider: aiProvider.nullable(),
    aiDefaultModel: z.string().max(120).nullable(),
    notifications: z.object({
      tasks: z.boolean(),
      events: z.boolean(),
      billing: z.boolean(),
      marketing: z.boolean(),
    }),
    onboardingCompleted: z.boolean(),
    splashAnimation: z.boolean(),
    allowAllDirs: z.boolean(),
    businessMode: z.boolean(),
    backup: z.object({
      auto: z.boolean(),
      intervalDays: z.number().int().min(1).max(30),
      keep: z.number().int().min(1).max(100),
    }),
    focus: z.object({
      minutes: z.number().int().min(1).max(240),
      dailyGoalMinutes: z.number().int().min(0).max(960),
      notify: z.boolean(),
    }),
    dashboard: z.object({
      order: z.array(z.enum(DASHBOARD_WIDGETS)).max(DASHBOARD_WIDGETS.length),
      hidden: z.array(z.enum(DASHBOARD_WIDGETS)).max(DASHBOARD_WIDGETS.length),
    }),
  })
  .partial();

const automationStep = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("command"), command: z.string().trim().min(1, "Comando vazio").max(2000) }),
  z.object({ kind: z.literal("open"), target: z.enum(["vscode", "explorer", "terminal"]) }),
]);

export const automationCreate = z.object({
  name: nonEmpty(120),
  description: z.string().trim().max(1000).nullable().optional().transform((v) => (v ? v : null)),
  projectId: id,
  steps: z.array(automationStep).min(1, "Adicione pelo menos um passo").max(20),
  enabled: z.boolean().optional(),
});

export const automationUpdate = z
  .object({
    name: nonEmpty(120),
    description: z.string().trim().max(1000).nullable().transform((v) => (v ? v : null)),
    projectId: id,
    steps: z.array(automationStep).min(1, "Adicione pelo menos um passo").max(20),
    enabled: z.boolean(),
  })
  .partial();

export const promptInput = z.object({ title: nonEmpty(120), content: z.string().trim().min(1, "O prompt está vazio").max(MAX_TEXT) });
export const promptPatch = promptInput.partial();

export const focusStart = z.object({
  minutes: z.number().int().min(1).max(240),
  projectId: id.nullable().optional(),
  taskId: id.nullable().optional(),
  label: z.string().trim().max(200).nullable().optional().transform((v) => (v ? v : null)),
});

/** ID de backup: o nome da pasta em `<userData>/backups` (data + tipo). */
export const backupId = z.string().regex(/^[\w-]{1,80}$/, "Backup inválido");

// --- Projects ---
export const projectCreate = z.object({
  name: nonEmpty(120),
  description: optionalText(2000),
  localPath: filePath,
  technologies: tags.optional(),
  githubUrl: url.optional().or(z.literal("").transform(() => undefined)),
  clientId: id.optional().or(z.literal("").transform(() => undefined)),
});

export const projectUpdate = z
  .object({
    name: nonEmpty(120),
    description: nullableText(2000),
    technologies: tags,
    githubUrl: url.nullable().or(z.literal("").transform(() => null)),
    clientId: id.nullable().or(z.literal("").transform(() => null)),
    status: z.enum(["ativo", "pausado", "concluido"]),
  })
  .partial();

/** "custom" só é ligado pelo seletor nativo (projects:pickIcon), nunca direto pelo renderer. */
export const projectIconMode = z.enum(["auto", "none"]);

// --- Tasks ---
export const taskCreate = z.object({
  title: nonEmpty(300),
  description: optionalText(5000),
  status: taskStatus.optional(),
  priority: taskPriority.optional(),
  projectId: id.optional(),
  clientId: id.optional(),
  dueDate: isoDate.optional(),
  dueTime: time.optional(),
  tags: tags.optional(),
});

export const taskUpdate = z
  .object({
    title: nonEmpty(300),
    description: nullableText(5000),
    status: taskStatus,
    priority: taskPriority,
    projectId: id.nullable(),
    clientId: id.nullable(),
    dueDate: isoDate.nullable(),
    dueTime: time.nullable(),
    tags,
  })
  .partial();

// --- Clients ---
const clientFields = {
  name: nonEmpty(160),
  company: nullableText(160),
  phone: nullableText(40),
  whatsapp: nullableText(40),
  instagram: nullableText(80),
  email: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .refine((v) => v === null || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email inválido")
    .transform((v) => (v ? v : null)),
  notes: nullableText(10_000),
  status: clientStatus,
  monthlyValue: z.number().min(0).max(1_000_000_000).nullable(),
  nextBillingDate: isoDate.nullable(),
  filesPath: filePath.nullable(),
};

export const clientCreate = z.object(clientFields).partial().required({ name: true });
export const clientUpdate = z.object(clientFields).partial();

// --- Marketing ---
export const marketingCreate = z.object({
  title: nonEmpty(300),
  type: marketingType,
  clientId: id.optional(),
  description: optionalText(5000),
  caption: optionalText(5000),
  status: marketingStatus.optional(),
  scheduledDate: isoDate.optional(),
  files: z.array(filePath).max(50).optional(),
});

export const marketingUpdate = z
  .object({
    title: nonEmpty(300),
    type: marketingType,
    clientId: id.nullable(),
    description: nullableText(5000),
    caption: nullableText(5000),
    status: marketingStatus,
    scheduledDate: isoDate.nullable(),
    files: z.array(filePath).max(50),
  })
  .partial();

// --- Calendar ---
export const eventCreate = z.object({
  title: nonEmpty(300),
  description: optionalText(5000),
  startsAt: isoDateTime,
  endsAt: isoDateTime.optional(),
  location: optionalText(300),
});

export const eventUpdate = z
  .object({
    title: nonEmpty(300),
    description: nullableText(5000),
    startsAt: isoDateTime,
    endsAt: isoDateTime.nullable(),
    location: nullableText(300),
  })
  .partial();

export const dateRange = z.object({ from: z.string().max(40), to: z.string().max(40) });

// --- AI ---
export const attachedFiles = z.array(z.object({ path: filePath, name: z.string().min(1).max(260) })).max(20);

export const conversationCreate = z.object({
  title: nonEmpty(200),
  provider: aiProvider,
  model: nonEmpty(120),
  projectId: id.optional(),
});

export const sendMessage = z.object({
  conversationId: id,
  content: z.string().trim().min(1).max(200_000),
  attachedFiles: attachedFiles.optional(),
});

export const councilRun = z.object({
  prompt: z.string().trim().min(1).max(100_000),
  targets: z
    .array(z.object({ provider: aiProvider, model: nonEmpty(120), requestId: id }))
    .min(1)
    .max(3),
  attachedFiles: attachedFiles.optional(),
  confirmedCount: z.number().int().min(1).max(3),
});

export const councilSynthesize = z.object({
  requestId: id,
  provider: aiProvider,
  model: nonEmpty(120),
  prompt: z.string().trim().min(1).max(100_000),
  answers: z.array(z.object({ label: z.string().max(80), content: z.string().max(200_000) })).min(1).max(3),
});

// --- Commands / Terminal ---
export const commandRun = z.object({
  command: z.string().trim().min(1).max(4000),
  cwd: filePath,
  decision: z.enum(["once", "always"]),
  confirmed: z.literal(true),
});

export const terminalCreate = z.object({
  cwd: filePath,
  shell: z.enum(["powershell", "cmd", "claude", "codex"]).optional(),
  cols: z.number().int().min(10).max(500),
  rows: z.number().int().min(5).max(300),
});

// --- Git ---
export const gitCommit = z.object({
  projectPath: filePath,
  message: z.string().trim().min(1).max(5000),
  stageAll: z.boolean(),
  /** Só estes caminhos (relativos ao repositório) entram no commit. */
  files: z.array(z.string().min(1).max(1024)).max(5000).optional(),
  confirmed: z.literal(true),
});

export const gitFileRef = z.object({ projectPath: filePath, file: z.string().min(1).max(1024) });
export const gitBranchName = z.string().trim().min(1).max(200);
export const gitSwitch = z.object({ projectPath: filePath, name: gitBranchName, confirmed: z.literal(true) });
export const gitCreateBranch = z.object({ projectPath: filePath, name: gitBranchName, checkout: z.boolean() });

export const gitRemoteOp = z.object({ projectPath: filePath, confirmed: z.literal(true) });

// --- Integrations ---
export const oauthClientConfig = z.object({
  clientId: z.string().trim().min(8).max(300),
  clientSecret: z.string().trim().max(300).optional(),
});

export const whatsappLink = z.object({
  phone: z.string().trim().min(8).max(40),
  message: z.string().max(2000).optional(),
});

export const spotifyAction = z.enum(["play", "pause", "next", "previous"]);

// Mensagens padrão do zod no idioma do app (as mensagens próprias dos schemas têm prioridade).
const ZOD_ERRORS = { pt: z.locales.ptBR().localeError, en: z.locales.en().localeError };

/** Faz o parse e transforma erros do zod numa mensagem legível no idioma do app. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value, { error: ZOD_ERRORS[currentLanguage()] });
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join(".") || tt(tm("entrada"));
    throw new Error(tt("Dados inválidos ({field}): {message}", { field, message: tt(issue?.message ?? tm("formato inesperado")) }));
  }
  return result.data;
}
