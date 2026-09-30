import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Flame } from "lucide-react";
import type { AppUsageDay, AppUsageSummary } from "@shared/types";
import { Dialog } from "@/components/ui/Dialog";
import { LoadingRows } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { parseLocalDate } from "@/lib/format";
import { getLocale, tr, trn } from "@/lib/i18n";

/** Semanas no mapa de calor do histórico (~6 meses). */
const WEEKS = 26;

/** "2h 15min", "45min", "menos de 1min". */
export function formatUsage(seconds: number): string {
  const min = Math.floor(seconds / 60);
  if (min < 1) return seconds > 0 ? tr("menos de 1min") : tr("0min");
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return tr("{m}min", { m });
  return m === 0 ? tr("{h}h", { h }) : tr("{h}h {m}min", { h, m });
}

/** Intensidade da célula pelo tempo do dia (até 30min, 2h, 4h e mais). */
function level(seconds: number): string {
  if (seconds <= 0) return "bg-bg-hover";
  if (seconds < 30 * 60) return "bg-accent/25";
  if (seconds < 2 * 3600) return "bg-accent/45";
  if (seconds < 4 * 3600) return "bg-accent/70";
  return "bg-accent";
}

function useAppUsage(days: number, active: boolean) {
  const [data, setData] = useState<AppUsageSummary | null>(null);
  const load = useCallback(async () => {
    const res = await attempt(window.workspace.appUsage.summary(days));
    if (res) setData(res);
  }, [days]);
  useEffect(() => {
    if (!active) return;
    void load();
    // O tempo de hoje continua subindo enquanto o app está aberto.
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [active, load]);
  return data;
}

/** Botão do Início com o tempo de hoje e a sequência; abre o histórico completo. */
export function AppUsageButton() {
  const [open, setOpen] = useState(false);
  const summary = useAppUsage(1, true);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-3 py-1.5 text-xs text-text-muted shadow-card transition-colors hover:border-border hover:text-text"
        data-app-usage
      >
        <Activity size={13} className="text-accent" />
        <span>
          {tr("Hoje")}: <span className="font-medium text-text">{summary ? formatUsage(summary.todaySeconds) : "…"}</span>
        </span>
        {summary && summary.currentStreak > 1 && (
          <span className="flex items-center gap-0.5 text-warning">
            <Flame size={12} /> {summary.currentStreak}
          </span>
        )}
      </button>
      <AppUsageDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AppUsageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useAppUsage(WEEKS * 7, open);

  // Colunas do mapa: semanas de domingo a sábado, terminando na semana de hoje.
  const weeks = useMemo(() => {
    if (!data) return [];
    const days = data.days;
    const lastDow = parseLocalDate(days[days.length - 1].day).getDay();
    const cells: (AppUsageDay | null)[] = [...days.slice(-(WEEKS - 1) * 7 - lastDow - 1), ...Array<null>(6 - lastDow).fill(null)];
    const cols: (AppUsageDay | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    return cols;
  }, [data]);

  const last7 = data?.days.slice(-7) ?? [];
  const max7 = Math.max(1, ...last7.map((d) => d.seconds));
  const avg = data && data.activeDays > 0 ? data.totalSeconds / data.activeDays : 0;
  const locale = getLocale();

  return (
    <Dialog open={open} onClose={onClose} size="lg" title={tr("Seu uso do Qyrex")} description={tr("Tempo com o app aberto e em uso. Na bandeja ou com o PC parado, não conta.")}>
      {!data ? (
        <LoadingRows rows={4} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={tr("Hoje")} value={formatUsage(data.todaySeconds)} />
            <Stat label={tr("Dias usados")} value={String(data.activeDays)} sub={data.firstDay ? tr("desde {date}", { date: parseLocalDate(data.firstDay).toLocaleDateString(locale, { month: "short", year: "numeric" }) }) : undefined} />
            <Stat label={tr("Média por dia")} value={formatUsage(avg)} sub={tr("Total: {time}", { time: formatUsage(data.totalSeconds) })} />
            <Stat
              label={tr("Sequência")}
              value={trn(data.currentStreak, "{n} dia", "{n} dias")}
              sub={tr("Recorde: {n}", { n: data.longestStreak })}
              highlight={data.currentStreak > 1}
            />
          </div>

          <div>
            <div className="section-title mb-2">{tr("Últimos 7 dias")}</div>
            <div className="flex h-28 items-end gap-2">
              {last7.map((d) => (
                <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={formatUsage(d.seconds)}>
                  <span className="text-[10px] tabular-nums text-text-faint">{d.seconds > 0 ? formatUsage(d.seconds) : ""}</span>
                  <div
                    className={cn("w-full rounded-md transition-[height] duration-500", d.seconds > 0 ? "bg-accent/70" : "bg-bg-hover")}
                    style={{ height: `${Math.max(4, (d.seconds / max7) * 72)}px` }}
                  />
                  <span className="text-[11px] capitalize text-text-muted">
                    {parseLocalDate(d.day).toLocaleDateString(locale, { weekday: "short" }).replace(".", "")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="section-title mb-2">{tr("Últimos 6 meses")}</div>
            <div className="flex gap-[3px] overflow-x-auto pb-1">
              {weeks.map((col, i) => (
                <div key={i} className="flex flex-col gap-[3px]">
                  {col.map((d, j) =>
                    d ? (
                      <span
                        key={d.day}
                        className={cn("h-3 w-3 rounded-[3px]", level(d.seconds))}
                        title={`${parseLocalDate(d.day).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}: ${formatUsage(d.seconds)}`}
                      />
                    ) : (
                      <span key={`empty-${j}`} className="h-3 w-3" />
                    )
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-text-faint">
              {tr("Menos")}
              {[0, 600, 3600, 3 * 3600, 5 * 3600].map((s) => (
                <span key={s} className={cn("h-2.5 w-2.5 rounded-[3px]", level(s))} />
              ))}
              {tr("Mais")}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated p-3">
      <div className="flex items-center gap-1 text-[11px] text-text-muted">
        {highlight && <Flame size={11} className="text-warning" />}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight text-text">{value}</div>
      {sub && <div className="truncate text-[11px] text-text-faint">{sub}</div>}
    </div>
  );
}
