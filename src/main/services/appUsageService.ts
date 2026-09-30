import { powerMonitor, type BrowserWindow } from "electron";
import { getDb } from "../database/db.js";
import type { AppUsageDay, AppUsageSummary } from "../../shared/types.js";

/**
 * Tempo de uso do Qyrex por dia (data local). Conta só enquanto a janela está
 * visível, não minimizada e o PC não está ocioso: deixar o app na bandeja ou
 * sair de perto do computador não soma horas.
 */

const TICK_SECONDS = 30;
/** Sem mexer no mouse/teclado por esse tempo, o PC conta como ocioso. */
const IDLE_SECONDS = 5 * 60;

const pad = (n: number) => String(n).padStart(2, "0");

/** Dia LOCAL (AAAA-MM-DD). */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + delta));
}

export function recordSession(now: Date = new Date()): void {
  getDb()
    .prepare("INSERT INTO app_usage (day, seconds, sessions) VALUES (?, 0, 1) ON CONFLICT(day) DO UPDATE SET sessions = sessions + 1")
    .run(localDay(now));
}

export function addActiveSeconds(seconds: number, now: Date = new Date()): void {
  const s = Math.max(0, Math.round(seconds));
  if (s === 0) return;
  getDb()
    .prepare("INSERT INTO app_usage (day, seconds, sessions) VALUES (?, ?, 0) ON CONFLICT(day) DO UPDATE SET seconds = seconds + excluded.seconds")
    .run(localDay(now), s);
}

/** Sequência atual e maior sequência de dias com uso (dias em ordem crescente). */
export function computeStreaks(usedDays: string[], today: string): { current: number; longest: number } {
  const set = new Set(usedDays);
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of [...set].sort()) {
    run = prev !== null && shiftDay(prev, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = day;
  }
  // Hoje ainda sem uso não quebra a sequência: conta a partir de ontem.
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }
  return { current, longest };
}

export function getAppUsageSummary(days: number, now: Date = new Date()): AppUsageSummary {
  const rows = getDb().prepare("SELECT day, seconds, sessions FROM app_usage ORDER BY day").all() as AppUsageDay[];
  const today = localDay(now);
  const byDay = new Map(rows.map((r) => [r.day, r]));

  const range: AppUsageDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = shiftDay(today, -i);
    range.push(byDay.get(day) ?? { day, seconds: 0, sessions: 0 });
  }

  // Um dia "usado" é o que teve tempo ativo contado (abrir e fechar na hora não conta).
  const used = rows.filter((r) => r.seconds > 0);
  const { current, longest } = computeStreaks(used.map((r) => r.day), today);
  return {
    days: range,
    todaySeconds: byDay.get(today)?.seconds ?? 0,
    totalSeconds: used.reduce((sum, r) => sum + r.seconds, 0),
    activeDays: used.length,
    currentStreak: current,
    longestStreak: longest,
    firstDay: rows[0]?.day ?? null,
  };
}

let timer: NodeJS.Timeout | null = null;

/** Começa a contar o tempo de uso da janela principal (uma sessão por abertura do app). */
export function startAppUsageTracker(getWindow: () => BrowserWindow | null): void {
  if (timer) return;
  recordSession();
  timer = setInterval(() => {
    const win = getWindow();
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    if (powerMonitor.getSystemIdleTime() >= IDLE_SECONDS) return;
    addActiveSeconds(TICK_SECONDS);
  }, TICK_SECONDS * 1000);
  timer.unref();
}
