import { Notification } from "electron";
import { getDb, getSettings } from "../database/db.js";
import { createLogger } from "../logger.js";

const log = createLogger("notifications");

/**
 * Lembretes desktop: tarefa vencendo, reunião próxima, cobrança e conteúdo
 * programado. Uma checagem local no SQLite por minuto (barata, sem rede);
 * `notification_log` garante que cada lembrete apareça uma única vez.
 */

const LEAD_MINUTES = 15;
let timer: NodeJS.Timeout | null = null;
let onClick: ((page: string) => void) | null = null;

const pad = (n: number) => String(n).padStart(2, "0");
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function localDateTime(d: Date): string {
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function alreadyNotified(key: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM notification_log WHERE key = ?").get(key));
}

function markNotified(key: string): void {
  getDb().prepare("INSERT OR IGNORE INTO notification_log (key) VALUES (?)").run(key);
}

function notify(key: string, title: string, body: string, page: string): void {
  if (alreadyNotified(key)) return;
  markNotified(key);
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on("click", () => onClick?.(page));
  n.show();
}

export interface Reminder {
  key: string;
  title: string;
  body: string;
  page: string;
}

/** Calcula os lembretes devidos em `now` — função pura sobre o banco, testável. */
export function dueReminders(now: Date): Reminder[] {
  const prefs = getSettings().notifications;
  const db = getDb();
  const today = localDate(now);
  const nowStr = localDateTime(now);
  const soon = localDateTime(new Date(now.getTime() + LEAD_MINUTES * 60_000));
  const reminders: Reminder[] = [];

  if (prefs.tasks) {
    const timed = db
      .prepare(
        `SELECT id, title, due_time FROM tasks
         WHERE status != 'concluido' AND due_date = ? AND due_time IS NOT NULL
           AND (due_date || 'T' || due_time || ':00') BETWEEN ? AND ?`
      )
      .all(today, nowStr, soon) as { id: string; title: string; due_time: string }[];
    for (const t of timed) {
      reminders.push({ key: `task:${t.id}:${today}`, title: "Tarefa vencendo", body: `${t.due_time} · ${t.title}`, page: "tarefas" });
    }
    // Resumo matinal das tarefas do dia sem horário.
    if (now.getHours() >= 8) {
      const count = (
        db
          .prepare("SELECT COUNT(*) AS n FROM tasks WHERE status != 'concluido' AND due_date = ? AND due_time IS NULL")
          .get(today) as { n: number }
      ).n;
      if (count > 0) {
        reminders.push({
          key: `tasks-today:${today}`,
          title: "Tarefas de hoje",
          body: `Você tem ${count} tarefa(s) para hoje.`,
          page: "tarefas",
        });
      }
    }
  }

  if (prefs.events) {
    const events = db
      .prepare("SELECT id, title, starts_at FROM calendar_events WHERE starts_at BETWEEN ? AND ?")
      .all(nowStr, soon) as { id: string; title: string; starts_at: string }[];
    for (const e of events) {
      reminders.push({
        key: `event:${e.id}:${e.starts_at}`,
        title: "Compromisso em breve",
        body: `${e.starts_at.slice(11, 16)} · ${e.title}`,
        page: "agenda",
      });
    }
  }

  if (prefs.billing && now.getHours() >= 9) {
    const clients = db
      .prepare("SELECT id, name, monthly_value FROM clients WHERE status = 'ativo' AND next_billing_date = ?")
      .all(today) as { id: string; name: string; monthly_value: number | null }[];
    for (const c of clients) {
      const value = c.monthly_value != null ? ` · R$ ${c.monthly_value.toFixed(2).replace(".", ",")}` : "";
      reminders.push({ key: `billing:${c.id}:${today}`, title: "Cobrança hoje", body: `${c.name}${value}`, page: "clientes" });
    }
  }

  if (prefs.marketing && now.getHours() >= 8) {
    const items = db
      .prepare("SELECT id, title, type FROM marketing_content WHERE scheduled_date = ? AND status != 'publicado'")
      .all(today) as { id: string; title: string; type: string }[];
    for (const m of items) {
      reminders.push({
        key: `marketing:${m.id}:${today}`,
        title: "Conteúdo programado para hoje",
        body: `${m.type.toUpperCase()} · ${m.title}`,
        page: "marketing",
      });
    }
  }

  return reminders;
}

function tick(): void {
  try {
    for (const r of dueReminders(new Date())) notify(r.key, r.title, r.body, r.page);
    // Limpeza do log antigo (mantém ~60 dias).
    getDb().prepare("DELETE FROM notification_log WHERE notified_at < datetime('now', '-60 days')").run();
  } catch (err) {
    log.error("Falha ao verificar lembretes:", err);
  }
}

export function startNotifications(clickHandler: (page: string) => void): void {
  onClick = clickHandler;
  if (timer) return;
  setTimeout(tick, 10_000); // primeira checagem logo após o app abrir, sem atrasar o startup
  timer = setInterval(tick, 60_000);
}

export function stopNotifications(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
