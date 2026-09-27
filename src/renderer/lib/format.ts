import { getLocale, tr } from "@/lib/i18n";

// Datas no horário LOCAL. `toISOString()` usa UTC e faria "hoje" virar
// "amanhã" depois das 21h no Brasil — por isso nada aqui usa UTC.

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(d: Date): string {
  return `${toLocalDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function todayISO(): string {
  return toLocalDate(new Date());
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** "AAAA-MM-DD" → Date local (meia-noite). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "AAAA-MM-DDTHH:MM[:SS]" local → Date. */
export function parseLocalDateTime(iso: string): Date {
  const [datePart, timePart = "00:00"] = iso.split("T");
  const [h, min] = timePart.split(":").map(Number);
  const d = parseLocalDate(datePart);
  d.setHours(h || 0, min || 0, 0, 0);
  return d;
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" }): string {
  if (!iso) return "";
  return parseLocalDate(iso).toLocaleDateString(getLocale(), opts);
}

export function formatTime(isoDateTime: string): string {
  return isoDateTime.slice(11, 16);
}

export function relativeDay(iso: string): string {
  const diff = Math.round((parseLocalDate(iso).getTime() - parseLocalDate(todayISO()).getTime()) / 86_400_000);
  if (diff === 0) return tr("Hoje");
  if (diff === 1) return tr("Amanhã");
  if (diff === -1) return tr("Ontem");
  if (diff < 0) return tr("{n} dias atrás", { n: -diff });
  if (diff < 7) return parseLocalDate(iso).toLocaleDateString(getLocale(), { weekday: "long" });
  return formatDate(iso);
}

/** Rótulo curto de dia para listas estreitas: "Hoje", "Amanhã" ou "dom 28". */
export function shortDay(iso: string): string {
  const diff = Math.round((parseLocalDate(iso).getTime() - parseLocalDate(todayISO()).getTime()) / 86_400_000);
  if (diff === 0) return tr("Hoje");
  if (diff === 1) return tr("Amanhã");
  const d = parseLocalDate(iso);
  return `${d.toLocaleDateString(getLocale(), { weekday: "short" }).replace(".", "")} ${d.getDate()}`;
}

/** Tempo relativo para timestamps UTC (ISO com Z) vindos do banco. */
export function timeAgo(isoUtc: string): string {
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(isoUtc) ? isoUtc : `${isoUtc.replace(" ", "T")}Z`;
  const seconds = Math.round((Date.now() - new Date(normalized).getTime()) / 1000);
  if (seconds < 60) return tr("agora");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return tr("há {n} min", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tr("há {n} h", { n: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return tr("há {n} d", { n: days });
  return new Date(normalized).toLocaleDateString(getLocale());
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return tr("Boa noite");
  if (h < 12) return tr("Bom dia");
  if (h < 18) return tr("Boa tarde");
  return tr("Boa noite");
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "";
  return value.toLocaleString(getLocale(), { style: "currency", currency: "BRL" });
}

/**
 * Telefone brasileiro legível: "11900000001" → "(11) 90000-0001",
 * "5511900000001" → "+55 (11) 90000-0001". Outros formatos voltam como vieram.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Número com "+" de outro país fica como o usuário escreveu.
  if (raw.trim().startsWith("+") && !digits.startsWith("55")) return raw;
  const country = digits.length >= 12 && digits.startsWith("55") ? "+55 " : "";
  const local = country ? digits.slice(2) : digits;
  if (local.length === 11) return `${country}(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `${country}(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  if (local.length === 9 && !country) return `${local.slice(0, 5)}-${local.slice(5)}`;
  if (local.length === 8 && !country) return `${local.slice(0, 4)}-${local.slice(4)}`;
  return raw;
}

/** Iniciais para avatar: primeira letra da primeira e da última palavra ("Studio Nova Pilates" → "SP"). */
export function initials(name: string, fallback = "?"): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

export function dirname(p: string): string {
  const parts = p.split(/[\\/]/);
  parts.pop();
  return parts.join("\\") || p;
}
