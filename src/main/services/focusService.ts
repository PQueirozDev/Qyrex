import { randomUUID } from "node:crypto";
import { getDb, getSettings } from "../database/db.js";
import { createLogger } from "../logger.js";
import { localDay } from "./appUsageService.js";
import { recordActivity } from "./recentService.js";
import type { FocusSession, FocusState, FocusSummary } from "../../shared/types.js";

const log = createLogger("focus");

/**
 * Sessões de foco. O main é o dono do relógio: a interface pode recarregar ou
 * ficar escondida e a sessão continua certa. Regras para nunca inventar tempo:
 * - cancelar descarta a sessão (não conta);
 * - encerrar antes conta só o que passou; o tempo nunca passa do planejado;
 * - enquanto roda, o trecho atual é gravado a cada minuto; se o app fechar sem
 *   aviso, na próxima abertura a sessão volta pausada com o que foi gravado.
 */

interface FocusRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  label: string | null;
  planned_minutes: number;
  started_at: string;
  ended_at: string | null;
  focused_seconds: number;
  resumed_at: string | null;
  status: string;
}

function rowToSession(row: FocusRow): FocusSession {
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    label: row.label,
    plannedMinutes: row.planned_minutes,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    focusedSeconds: row.focused_seconds,
    resumedAt: row.resumed_at,
    status: row.status as FocusSession["status"],
  };
}

/** Segundos focados até `now`, sem passar do planejado. */
export function elapsedSeconds(session: FocusSession, now = new Date()): number {
  const running = session.status === "running" && session.resumedAt ? Math.max(0, (now.getTime() - Date.parse(session.resumedAt)) / 1000) : 0;
  return Math.min(session.plannedMinutes * 60, Math.floor(session.focusedSeconds + running));
}

function activeRow(): FocusRow | undefined {
  return getDb().prepare("SELECT * FROM focus_sessions WHERE status IN ('running', 'paused') ORDER BY started_at DESC LIMIT 1").get() as FocusRow | undefined;
}

export function getState(now = new Date()): FocusState {
  const row = activeRow();
  const session = row ? rowToSession(row) : null;
  return { session, elapsedSeconds: session ? elapsedSeconds(session, now) : 0 };
}

// --- Relógio no main --------------------------------------------------------------

let listener: ((state: FocusState) => void) | null = null;
let completionTimer: NodeJS.Timeout | null = null;
let checkpointTimer: NodeJS.Timeout | null = null;
let onComplete: ((session: FocusSession) => void) | null = null;

/** O index.ts liga aqui o envio do estado para a janela e a notificação de fim. */
export function setFocusHooks(hooks: { changed: (state: FocusState) => void; completed: (session: FocusSession) => void }): void {
  listener = hooks.changed;
  onComplete = hooks.completed;
}

function clearTimers(): void {
  if (completionTimer) clearTimeout(completionTimer);
  if (checkpointTimer) clearInterval(checkpointTimer);
  completionTimer = null;
  checkpointTimer = null;
}

/** Agenda o fim e o checkpoint de 1 minuto conforme a sessão ativa (ou limpa, se não houver). */
function schedule(): void {
  clearTimers();
  const { session, elapsedSeconds: elapsed } = getState();
  if (!session || session.status !== "running") return;
  const remainingMs = Math.max(0, (session.plannedMinutes * 60 - elapsed) * 1000);
  completionTimer = setTimeout(() => {
    try {
      const done = finish();
      if (done) onComplete?.(done);
    } catch (err) {
      log.warn("Falha ao encerrar a sessão de foco:", err);
    }
  }, remainingMs);
  completionTimer.unref?.();
  checkpointTimer = setInterval(() => {
    try {
      checkpoint();
    } catch (err) {
      log.warn("Falha no checkpoint do foco:", err);
    }
  }, 60_000);
  checkpointTimer.unref?.();
}

function emit(): FocusState {
  schedule();
  const state = getState();
  listener?.(state);
  return state;
}

/** Reenvia o estado atual para a interface (ex.: depois de restaurar um backup). */
export function notifyChanged(): void {
  listener?.(getState());
}

/** Grava o trecho atual em focused_seconds e reinicia o trecho em `now`. */
export function checkpoint(now = new Date()): void {
  const row = activeRow();
  if (!row || row.status !== "running" || !row.resumed_at) return;
  const total = elapsedSeconds(rowToSession(row), now);
  getDb().prepare("UPDATE focus_sessions SET focused_seconds = ?, resumed_at = ? WHERE id = ?").run(total, now.toISOString(), row.id);
}

// --- Ações -----------------------------------------------------------------------

export function start(input: { minutes: number; projectId?: string | null; taskId?: string | null; label?: string | null }, now = new Date()): FocusState {
  if (activeRow()) throw new Error("Já existe uma sessão de foco em andamento.");
  const id = randomUUID();
  const iso = now.toISOString();
  getDb()
    .prepare(
      `INSERT INTO focus_sessions (id, project_id, task_id, label, planned_minutes, started_at, focused_seconds, resumed_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'running')`
    )
    .run(id, input.projectId ?? null, input.taskId ?? null, input.label ?? null, input.minutes, iso, iso);
  return emit();
}

export function pause(now = new Date()): FocusState {
  const row = activeRow();
  if (!row || row.status !== "running") throw new Error("Nenhuma sessão de foco rodando.");
  const total = elapsedSeconds(rowToSession(row), now);
  getDb().prepare("UPDATE focus_sessions SET focused_seconds = ?, resumed_at = NULL, status = 'paused' WHERE id = ?").run(total, row.id);
  return emit();
}

export function resume(now = new Date()): FocusState {
  const row = activeRow();
  if (!row || row.status !== "paused") throw new Error("Nenhuma sessão de foco pausada.");
  getDb().prepare("UPDATE focus_sessions SET resumed_at = ?, status = 'running' WHERE id = ?").run(now.toISOString(), row.id);
  return emit();
}

/** Encerra contando o tempo focado. Devolve a sessão encerrada (ou null se não havia). */
export function finish(now = new Date()): FocusSession | null {
  const row = activeRow();
  if (!row) return null;
  const total = elapsedSeconds(rowToSession(row), now);
  getDb()
    .prepare("UPDATE focus_sessions SET focused_seconds = ?, resumed_at = NULL, ended_at = ?, status = 'completed' WHERE id = ?")
    .run(total, now.toISOString(), row.id);
  const done = rowToSession(getDb().prepare("SELECT * FROM focus_sessions WHERE id = ?").get(row.id) as FocusRow);
  if (done.projectId && total >= 60) {
    const project = getDb().prepare("SELECT name FROM projects WHERE id = ?").get(done.projectId) as { name: string } | undefined;
    if (project) recordActivity("focus", done.projectId, project.name);
  }
  emit();
  return done;
}

/** Descarta a sessão ativa: o tempo dela não entra em nenhum resumo. */
export function cancel(now = new Date()): FocusState {
  const row = activeRow();
  if (!row) throw new Error("Nenhuma sessão de foco em andamento.");
  getDb().prepare("UPDATE focus_sessions SET resumed_at = NULL, ended_at = ?, status = 'cancelled' WHERE id = ?").run(now.toISOString(), row.id);
  return emit();
}

/**
 * Abertura do app: uma sessão que ficou "rodando" (app fechado sem pausar, PC
 * desligado) volta pausada só com o tempo já gravado; a que já tinha passado
 * do planejado é encerrada.
 */
export function recoverOnStartup(): void {
  const row = activeRow();
  if (row?.status === "running") {
    const s = rowToSession(row);
    if (s.focusedSeconds >= s.plannedMinutes * 60) finish();
    else getDb().prepare("UPDATE focus_sessions SET resumed_at = NULL, status = 'paused' WHERE id = ?").run(row.id);
  }
  schedule();
}

/** Ao sair do app: pausa a sessão rodando, gravando o tempo até agora. */
export function pauseOnQuit(): void {
  clearTimers();
  const row = activeRow();
  if (row?.status === "running") pause();
}

// --- Resumo ----------------------------------------------------------------------

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + delta));
}

/** Resumo dos últimos `days` dias (dia local). Só sessões encerradas e a ativa contam; canceladas não. */
export function getSummary(days = 7, now = new Date()): FocusSummary {
  const today = localDay(now);
  const first = shiftDay(today, -(days - 1));
  // Margem de um dia na consulta (fuso); o corte certo é feito pelo dia local abaixo.
  const [fy, fm, fd] = first.split("-").map(Number);
  const since = new Date(fy, fm - 1, fd - 1).toISOString();
  const rows = (
    getDb()
      .prepare("SELECT * FROM focus_sessions WHERE started_at >= ? AND status IN ('completed', 'running', 'paused') ORDER BY started_at DESC")
      .all(since) as FocusRow[]
  ).map(rowToSession);

  const perDay = new Map<string, number>();
  for (let i = 0; i < days; i++) perDay.set(shiftDay(first, i), 0);
  const perProject = new Map<string | null, number>();
  let sessions = 0;
  for (const s of rows) {
    const day = localDay(new Date(s.startedAt));
    if (!perDay.has(day)) continue;
    const secs = s.status === "completed" ? s.focusedSeconds : elapsedSeconds(s, now);
    perDay.set(day, (perDay.get(day) ?? 0) + secs);
    perProject.set(s.projectId, (perProject.get(s.projectId) ?? 0) + secs);
    if (s.status === "completed") sessions++;
  }

  const names = new Map(
    (getDb().prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );
  const recent = (getDb().prepare("SELECT * FROM focus_sessions WHERE status = 'completed' ORDER BY started_at DESC LIMIT 15").all() as FocusRow[]).map(rowToSession);

  return {
    days: Array.from(perDay, ([day, seconds]) => ({ day, seconds })),
    todaySeconds: perDay.get(today) ?? 0,
    totalSeconds: Array.from(perDay.values()).reduce((a, b) => a + b, 0),
    completedSessions: sessions,
    byProject: Array.from(perProject, ([projectId, seconds]) => ({
      projectId,
      name: projectId ? names.get(projectId) ?? null : null,
      seconds,
    }))
      .filter((p) => p.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds),
    recent: recent.map((s) => ({ ...s, projectName: s.projectId ? names.get(s.projectId) ?? null : null })),
    dailyGoalMinutes: getSettings().focus.dailyGoalMinutes,
  };
}
