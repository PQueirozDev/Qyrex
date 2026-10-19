import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../database/db.js";
import { createLogger } from "../logger.js";
import { assessCommand } from "../security/commands.js";
import { assertPathAllowedAndExists } from "../security/paths.js";
import { executeConfirmed } from "./commandService.js";
import { getProject } from "./projectService.js";
import { recordActivity } from "./recentService.js";
import { openInExplorer, openInVSCode, openTerminal } from "./systemService.js";
import { tt } from "../i18n.js";
import type { Automation, AutomationRun, AutomationStep, AutomationStepResult, AutomationSuggestion, CommandAssessment } from "../../shared/types.js";

const log = createLogger("automations");

/**
 * Automações: passos em sequência na pasta de um projeto.
 * Regras de segurança:
 * - nada é agendado nem roda em segundo plano: toda execução vem de um clique
 *   com `confirmed: true`, depois do diálogo que mostra cada passo e o risco;
 * - o risco é recalculado aqui (o renderer não é confiável) e "Permitir
 *   sempre" do chat da IA não vale para automações;
 * - a pasta do projeto passa pela allowlist antes de cada execução;
 * - para no primeiro passo que falhar.
 */

/** Quanto da saída de cada passo é guardado no histórico (o fim, que é onde ficam os erros). */
const OUTPUT_TAIL = 20_000;
/** Execuções guardadas por automação. */
const KEEP_RUNS = 30;

interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  steps: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  automation_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  steps: string;
  error: string | null;
}

function parseSteps(raw: string): AutomationStep[] {
  try {
    const list = JSON.parse(raw) as AutomationStep[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function assess(step: AutomationStep): CommandAssessment {
  return step.kind === "command" ? assessCommand(step.command) : { risk: "safe", reasons: [] };
}

function rowToRun(row: RunRow): AutomationRun {
  return {
    id: row.id,
    automationId: row.automation_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as AutomationRun["status"],
    steps: JSON.parse(row.steps) as AutomationStepResult[],
    error: row.error,
  };
}

function lastRun(automationId: string): AutomationRun | null {
  const row = getDb().prepare("SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT 1").get(automationId) as RunRow | undefined;
  return row ? rowToRun(row) : null;
}

function rowToAutomation(row: AutomationRow): Automation {
  const steps = parseSteps(row.steps);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    projectId: row.project_id,
    steps: steps.map((s) => ({ ...s, assessment: assess(s) })),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRun: lastRun(row.id),
  };
}

export function listAutomations(projectId?: string): Automation[] {
  const rows = (
    projectId
      ? getDb().prepare("SELECT * FROM automations WHERE project_id = ? ORDER BY name COLLATE NOCASE").all(projectId)
      : getDb().prepare("SELECT * FROM automations ORDER BY name COLLATE NOCASE").all()
  ) as AutomationRow[];
  return rows.map(rowToAutomation);
}

export function getAutomation(id: string): Automation | null {
  const row = getDb().prepare("SELECT * FROM automations WHERE id = ?").get(id) as AutomationRow | undefined;
  return row ? rowToAutomation(row) : null;
}

/** Só o que é guardado: tipo + dados do passo (a avaliação de risco é sempre recalculada). */
function cleanSteps(steps: AutomationStep[]): AutomationStep[] {
  return steps.map((s) => (s.kind === "command" ? { kind: "command", command: s.command.trim() } : { kind: "open", target: s.target }));
}

export function createAutomation(input: { name: string; description?: string | null; projectId: string; steps: AutomationStep[]; enabled?: boolean }): Automation {
  if (!getProject(input.projectId)) throw new Error("Projeto não encontrado.");
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO automations (id, name, description, project_id, steps, enabled) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, input.name, input.description ?? null, input.projectId, JSON.stringify(cleanSteps(input.steps)), input.enabled === false ? 0 : 1);
  return getAutomation(id)!;
}

export function updateAutomation(
  id: string,
  patch: Partial<{ name: string; description: string | null; projectId: string; steps: AutomationStep[]; enabled: boolean }>
): Automation {
  const current = getAutomation(id);
  if (!current) throw new Error("Automação não encontrada.");
  if (patch.projectId && !getProject(patch.projectId)) throw new Error("Projeto não encontrado.");
  const merged = { ...current, ...patch };
  getDb()
    .prepare(
      "UPDATE automations SET name = ?, description = ?, project_id = ?, steps = ?, enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    )
    .run(merged.name, merged.description, merged.projectId, JSON.stringify(cleanSteps(merged.steps)), merged.enabled ? 1 : 0, id);
  return getAutomation(id)!;
}

export function deleteAutomation(id: string): void {
  getDb().prepare("DELETE FROM automations WHERE id = ?").run(id);
}

export function listRuns(automationId: string, limit = 20): AutomationRun[] {
  return (getDb().prepare("SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT ?").all(automationId, limit) as RunRow[]).map(rowToRun);
}

/** Últimas execuções de todas as automações (widget do Início). */
export function recentRuns(limit = 6): (AutomationRun & { automationName: string; projectId: string })[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*, a.name AS automation_name, a.project_id AS project_id FROM automation_runs r
       JOIN automations a ON a.id = r.automation_id ORDER BY r.started_at DESC LIMIT ?`
    )
    .all(limit) as (RunRow & { automation_name: string; project_id: string })[];
  return rows.map((r) => ({ ...rowToRun(r), automationName: r.automation_name, projectId: r.project_id }));
}

// --- Execução ----------------------------------------------------------------------

const running = new Map<string, AbortController>(); // automationId -> controle
let progressListener: ((run: AutomationRun) => void) | null = null;

export function setProgressListener(fn: ((run: AutomationRun) => void) | null): void {
  progressListener = fn;
}

function saveRun(run: AutomationRun): void {
  getDb()
    .prepare("UPDATE automation_runs SET finished_at = ?, status = ?, steps = ?, error = ? WHERE id = ?")
    .run(run.finishedAt, run.status, JSON.stringify(run.steps), run.error, run.id);
  progressListener?.(run);
}

const tail = (text: string) => (text.length > OUTPUT_TAIL ? `…${text.slice(-OUTPUT_TAIL)}` : text);

/** Abrir VS Code/Explorer/terminal: injetável nos testes (não abre nada de verdade). */
type Opener = (target: "vscode" | "explorer" | "terminal", dir: string) => Promise<void>;
const defaultOpener: Opener = (target, dir) => (target === "vscode" ? openInVSCode(dir) : target === "explorer" ? openInExplorer(dir) : openTerminal(dir));

/**
 * Executa a automação. Só é chamada depois da confirmação do usuário (o handler
 * IPC exige `confirmed: true`). Devolve a execução encerrada.
 */
export async function runAutomation(id: string, opener: Opener = defaultOpener): Promise<AutomationRun> {
  const automation = getAutomation(id);
  if (!automation) throw new Error("Automação não encontrada.");
  if (!automation.enabled) throw new Error("Esta automação está desativada.");
  if (running.has(id)) throw new Error("Esta automação já está rodando.");
  const project = getProject(automation.projectId);
  if (!project) throw new Error("Projeto não encontrado.");
  const cwd = assertPathAllowedAndExists(project.localPath);

  const controller = new AbortController();
  running.set(id, controller);
  const run: AutomationRun = {
    id: randomUUID(),
    automationId: id,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    steps: automation.steps.map((s) => ({ step: { ...s }, status: "pending", exitCode: null, stdout: "", stderr: "", durationMs: 0, risk: s.assessment.risk })),
    error: null,
  };
  getDb().prepare("INSERT INTO automation_runs (id, automation_id, started_at, status, steps) VALUES (?, ?, ?, 'running', ?)").run(run.id, id, run.startedAt, JSON.stringify(run.steps));
  progressListener?.(run);
  log.info(`Automação "${automation.name}" iniciada pelo usuário (${automation.steps.length} passos)`);

  try {
    for (const result of run.steps) {
      if (controller.signal.aborted) break;
      result.status = "running";
      saveRun(run);
      const started = Date.now();
      const step = result.step;
      try {
        if (step.kind === "command") {
          const out = await executeConfirmed(step.command, cwd, controller.signal);
          result.exitCode = out.exitCode;
          result.stdout = tail(out.stdout);
          result.stderr = tail(out.stderr);
          if (controller.signal.aborted) result.status = "cancelled";
          else if (out.timedOut) {
            result.status = "failed";
            result.stderr = tail(`${out.stderr}\n${tt("Tempo limite de 5 minutos excedido.")}`);
          } else result.status = out.exitCode === 0 ? "success" : "failed";
        } else {
          await opener(step.target, cwd);
          result.status = "success";
        }
      } catch (err) {
        result.status = "failed";
        result.stderr = err instanceof Error ? err.message : String(err);
      }
      result.durationMs = Date.now() - started;
      saveRun(run);
      if (result.status !== "success") break;
    }
    for (const r of run.steps) if (r.status === "pending") r.status = "skipped";
    run.status = controller.signal.aborted ? "cancelled" : run.steps.every((s) => s.status === "success") ? "success" : "failed";
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
  } finally {
    running.delete(id);
    run.finishedAt = new Date().toISOString();
    saveRun(run);
    recordActivity("automation", id, automation.name);
    pruneRuns(id);
  }
  return run;
}

export function cancelRun(automationId: string): boolean {
  const controller = running.get(automationId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function isRunning(automationId: string): boolean {
  return running.has(automationId);
}

function pruneRuns(automationId: string): void {
  getDb()
    .prepare(
      `DELETE FROM automation_runs WHERE automation_id = ? AND id NOT IN (
         SELECT id FROM automation_runs WHERE automation_id = ? ORDER BY started_at DESC LIMIT ?)`
    )
    .run(automationId, automationId, KEEP_RUNS);
}

/** Execuções que ficaram "rodando" quando o app fechou viram "interrompidas". */
export function markInterruptedRuns(): void {
  getDb().prepare("UPDATE automation_runs SET status = 'cancelled', finished_at = started_at, error = ? WHERE status = 'running'").run(tt("Interrompida: o Qyrex foi fechado durante a execução."));
}

// --- Sugestões a partir do projeto ---------------------------------------------------

function packageManager(dir: string): "npm" | "pnpm" | "yarn" | "bun" {
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock"))) return "bun";
  return "npm";
}

/** Modelos prontos com base no que existe na pasta (scripts do package.json, git). Nada é criado sem o usuário salvar. */
export function suggestAutomations(projectId: string): AutomationSuggestion[] {
  const project = getProject(projectId);
  if (!project) throw new Error("Projeto não encontrado.");
  const dir = assertPathAllowedAndExists(project.localPath);
  const suggestions: AutomationSuggestion[] = [
    {
      name: tt("Abrir ambiente de trabalho"),
      description: tt("Abre o projeto no VS Code e um terminal na pasta."),
      steps: [
        { kind: "open", target: "vscode" },
        { kind: "open", target: "terminal" },
      ],
    },
  ];

  let scripts: Record<string, string> = {};
  try {
    scripts = (JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    // sem package.json (ou inválido): sem sugestões de scripts
  }
  const pm = packageManager(dir);
  const runScript = (name: string) => (pm === "npm" ? (name === "test" ? "npm test" : `npm run ${name}`) : `${pm} ${name === "test" ? "test" : `run ${name}`}`);

  if (scripts.test) suggestions.push({ name: tt("Rodar testes"), description: null, steps: [{ kind: "command", command: runScript("test") }] });
  const checks = ["lint", "typecheck", "build"].filter((s) => scripts[s]);
  if (checks.length > 0) {
    suggestions.push({ name: tt("Verificar o projeto"), description: tt("Lint, tipos e build, parando no primeiro erro."), steps: checks.map((s) => ({ kind: "command", command: runScript(s) })) });
  }
  if (fs.existsSync(path.join(dir, ".git"))) {
    suggestions.push({
      name: tt("Checagem do Git"),
      description: tt("Busca o remoto e mostra o estado da branch e os últimos commits."),
      steps: [
        { kind: "command", command: "git fetch --prune" },
        { kind: "command", command: "git status -sb" },
        { kind: "command", command: "git log --oneline -5" },
      ],
    });
  }
  return suggestions;
}
