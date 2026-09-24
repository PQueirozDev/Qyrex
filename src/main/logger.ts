import fs from "node:fs";
import path from "node:path";

/**
 * Logger interno (INFO / WARNING / ERROR) gravado em <userData>/logs/.
 *
 * Toda mensagem passa por `redact()` antes de ir para o disco: API keys,
 * tokens OAuth, cabeçalhos Authorization e parâmetros `key=`/`token=` em URLs
 * são mascarados. Mesmo assim, a regra é não passar segredos para o logger.
 */

export type LogLevel = "INFO" | "WARNING" | "ERROR";

let logDir: string | null = null;
const MAX_FILES = 14;

const SECRET_PATTERNS: [RegExp, string][] = [
  // Cabeçalhos e esquemas de autenticação
  [/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,"']+/gi, "$1$2[REDACTED]"],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED]"],
  // Chaves conhecidas: Anthropic, OpenAI, Google, GitHub
  [/\bsk-[A-Za-z0-9_-]{8,}/g, "sk-[REDACTED]"],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "AIza[REDACTED]"],
  [/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}/g, "$1[REDACTED]"],
  // Parâmetros de query / campos JSON sensíveis
  [
    /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|token|code_verifier|key)["']?\s*[:=]\s*["']?)[^"'&\s,}]+/gi,
    "$1[REDACTED]",
  ],
];

export function redact(input: string): string {
  let out = input;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function initLogger(dir: string): void {
  logDir = dir;
  fs.mkdirSync(dir, { recursive: true });
  pruneOldLogs();
}

export function getLogDir(): string | null {
  return logDir;
}

function pruneOldLogs(): void {
  if (!logDir) return;
  try {
    const files = fs
      .readdirSync(logDir)
      .filter((f) => f.startsWith("workspace-") && f.endsWith(".log"))
      .sort();
    for (const file of files.slice(0, Math.max(0, files.length - MAX_FILES))) {
      fs.rmSync(path.join(logDir, file), { force: true });
    }
  } catch {
    // Falha ao limpar logs antigos nunca deve derrubar o app.
  }
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function write(level: LogLevel, scope: string, args: unknown[]): void {
  const now = new Date();
  const line = redact(`${now.toISOString()} [${level}] [${scope}] ${args.map(formatArg).join(" ")}`);

  if (process.env.NODE_ENV !== "test") {
    const sink = level === "ERROR" ? console.error : level === "WARNING" ? console.warn : console.log;
    sink(line);
  }

  if (!logDir) return;
  const file = path.join(logDir, `workspace-${now.toISOString().slice(0, 10)}.log`);
  try {
    fs.appendFileSync(file, line + "\n", "utf-8");
  } catch {
    // Disco cheio / permissão: não há o que fazer além de seguir sem log em disco.
  }
}

export function createLogger(scope: string) {
  return {
    info: (...args: unknown[]) => write("INFO", scope, args),
    warn: (...args: unknown[]) => write("WARNING", scope, args),
    error: (...args: unknown[]) => write("ERROR", scope, args),
  };
}
