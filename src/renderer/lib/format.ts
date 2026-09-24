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
  return parseLocalDate(iso).toLocaleDateString("pt-BR", opts);
}

export function formatTime(isoDateTime: string): string {
  return isoDateTime.slice(11, 16);
}

export function relativeDay(iso: string): string {
  const diff = Math.round((parseLocalDate(iso).getTime() - parseLocalDate(todayISO()).getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  if (diff < 0) return `${-diff} dias atrás`;
  if (diff < 7) return parseLocalDate(iso).toLocaleDateString("pt-BR", { weekday: "long" });
  return formatDate(iso);
}

/** Tempo relativo para timestamps UTC (ISO com Z) vindos do banco. */
export function timeAgo(isoUtc: string): string {
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(isoUtc) ? isoUtc : `${isoUtc.replace(" ", "T")}Z`;
  const seconds = Math.round((Date.now() - new Date(normalized).getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return new Date(normalized).toLocaleDateString("pt-BR");
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
