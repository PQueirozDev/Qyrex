import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Square, Target, Timer, X } from "lucide-react";
import type { FocusSummary } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, LoadingRows, Segmented, Switch } from "@/components/ui/primitives";
import { formatUsage } from "@/components/AppUsage";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { parseLocalDate, timeAgo } from "@/lib/format";
import { getLocale, tr, trn } from "@/lib/i18n";
import { liveElapsed, useFocusStore } from "@/stores/useFocusStore";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { confirmAction } from "@/stores/useUIStore";

const PRESETS = [15, 25, 50, 90];

const pad = (n: number) => String(n).padStart(2, "0");
function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** Re-renderiza a cada segundo enquanto a sessão roda (parado, não gasta nada). */
function useTick(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function useFocusSummary(days: number, refreshKey: unknown): FocusSummary | null {
  const [data, setData] = useState<FocusSummary | null>(null);
  useEffect(() => {
    void attempt(window.workspace.focus.summary(days)).then((d) => d && setData(d));
  }, [days, refreshKey]);
  return data;
}

/** Cabeçalho: botão "Foco" ou o relógio da sessão com pausar/retomar/encerrar. */
export function FocusHeaderButton() {
  const { state, readAt, init, setDialog, pause, resume, finish } = useFocusStore();
  const session = state.session;
  const now = useTick(session?.status === "running");
  const projects = useProjectsStore((s) => s.projects);
  useEffect(() => init(), [init]);

  if (!session) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setDialog("start")} title={tr("Iniciar sessão de foco")}>
        <Timer size={14} /> {tr("Foco")}
      </Button>
    );
  }

  const elapsed = liveElapsed(state, readAt, now);
  const remaining = session.plannedMinutes * 60 - elapsed;
  const project = projects.find((p) => p.id === session.projectId);
  const running = session.status === "running";
  return (
    <div className={cn("flex items-center gap-0.5 rounded-lg border px-1 py-0.5", running ? "border-accent/40 bg-accent/10" : "border-border-subtle bg-bg-elevated")}>
      <button
        onClick={() => setDialog("history")}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-text hover:bg-bg-hover"
        title={project ? tr("Foco em {name}", { name: project.name }) : tr("Sessão de foco")}
      >
        <Timer size={13} className={running ? "text-accent" : "text-text-faint"} />
        <span className="font-mono tabular-nums">{clock(remaining)}</span>
        {project && <span className="hidden max-w-[110px] truncate text-text-muted 2xl:inline">{project.name}</span>}
      </button>
      <button
        onClick={() => void (running ? pause() : resume())}
        className="rounded-md p-1 text-text-muted hover:bg-bg-hover hover:text-text"
        title={running ? tr("Pausar") : tr("Retomar")}
        aria-label={running ? tr("Pausar") : tr("Retomar")}
      >
        {running ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button onClick={() => void finish()} className="rounded-md p-1 text-text-muted hover:bg-bg-hover hover:text-text" title={tr("Encerrar e contar")} aria-label={tr("Encerrar e contar")}>
        <Square size={12} />
      </button>
    </div>
  );
}

/** Diálogo de iniciar uma sessão. */
function StartFocusDialog() {
  const { dialog, setDialog, start } = useFocusStore();
  const { settings } = useSettingsStore();
  const allProjects = useProjectsStore((s) => s.projects);
  const loadProjects = useProjectsStore((s) => s.load);
  const projectsLoaded = useProjectsStore((s) => s.loaded);
  const projects = useMemo(() => allProjects.filter((p) => !p.archivedAt), [allProjects]);
  const open = dialog === "start";
  const [minutes, setMinutes] = useState(25);
  const [projectId, setProjectId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMinutes(settings?.focus.minutes ?? 25);
    setLabel("");
    if (!projectsLoaded) void loadProjects();
  }, [open, settings?.focus.minutes, projectsLoaded, loadProjects]);

  async function begin() {
    setBusy(true);
    const ok = await start({ minutes, projectId: projectId || null, label: label.trim() || null });
    setBusy(false);
    if (ok) setDialog(null);
  }

  const preset = PRESETS.includes(minutes) ? String(minutes) : "custom";
  return (
    <Dialog
      open={open}
      onClose={() => setDialog(null)}
      size="sm"
      title={tr("Sessão de foco")}
      description={tr("Um temporizador simples. Ao terminar, o tempo entra no histórico do dia e do projeto.")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setDialog("history")}>
            {tr("Histórico")}
          </Button>
          <Button size="sm" className="ml-auto" onClick={() => void begin()} loading={busy} disabled={minutes < 1 || minutes > 240}>
            <Play size={13} /> {tr("Começar")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={tr("Duração")}>
          <div className="flex items-center gap-2">
            <Segmented
              value={preset}
              onChange={(v) => v !== "custom" && setMinutes(Number(v))}
              options={[...PRESETS.map((m) => ({ value: String(m), label: tr("{m}min", { m }) })), { value: "custom", label: tr("Outro") }]}
            />
            {preset === "custom" && (
              <input
                type="number"
                min={1}
                max={240}
                className="input w-20 py-1 text-xs"
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))}
                aria-label={tr("Minutos")}
              />
            )}
          </div>
        </Field>
        <Field label={tr("Projeto")} hint={tr("Opcional. O tempo aparece no resumo do projeto.")}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{tr("Nenhum")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("No que você vai focar?")} hint={tr("Opcional.")}>
          <input className="input" value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} placeholder={tr("Ex.: terminar o checkout")} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Barras dos últimos dias (minutos reais, sem escala inventada). */
function DayBars({ summary }: { summary: FocusSummary }) {
  const max = Math.max(...summary.days.map((d) => d.seconds), summary.dailyGoalMinutes * 60, 1);
  const goalPct = summary.dailyGoalMinutes > 0 ? (summary.dailyGoalMinutes * 60) / max : null;
  return (
    <div className="relative flex h-28 items-end gap-1.5">
      {goalPct !== null && (
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-success/50" style={{ bottom: `${goalPct * 100}%` }} title={tr("Meta diária")} />
      )}
      {summary.days.map((d) => {
        const date = parseLocalDate(d.day);
        return (
          <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${date.toLocaleDateString(getLocale())}: ${formatUsage(d.seconds)}`}>
            <div className="w-full rounded-t bg-accent/70" style={{ height: `${(d.seconds / max) * 100}%`, minHeight: d.seconds > 0 ? 2 : 0 }} />
            <span className="text-[10px] text-text-faint">{date.toLocaleDateString(getLocale(), { weekday: "short" }).replace(".", "")}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Histórico: hoje, 7 dias, por projeto, sessões recentes e preferências. */
function FocusHistoryDialog() {
  const { dialog, setDialog, state, cancel } = useFocusStore();
  const { settings, update } = useSettingsStore();
  const open = dialog === "history";
  const summary = useFocusSummary(7, open ? `${state.session?.status}-${state.session?.id}` : null);
  const prefs = settings?.focus;

  async function discard() {
    const ok = await confirmAction({
      title: tr("Descartar a sessão atual?"),
      description: tr("O tempo desta sessão não será contado em nenhum resumo."),
      danger: true,
      confirmLabel: tr("Descartar"),
    });
    if (ok) await cancel();
  }

  return (
    <Dialog
      open={open}
      onClose={() => setDialog(null)}
      size="lg"
      title={tr("Foco")}
      footer={
        <>
          {state.session && (
            <Button variant="ghost" size="sm" className="mr-auto text-danger" onClick={() => void discard()}>
              <X size={13} /> {tr("Descartar sessão")}
            </Button>
          )}
          {!state.session && (
            <Button size="sm" className="ml-auto" onClick={() => setDialog("start")}>
              <Play size={13} /> {tr("Nova sessão")}
            </Button>
          )}
        </>
      }
    >
      {!summary ? (
        <LoadingRows rows={4} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-[11px] text-text-faint">{tr("Hoje")}</p>
              <p className="text-lg font-semibold text-text">{formatUsage(summary.todaySeconds)}</p>
              {summary.dailyGoalMinutes > 0 && (
                <p className="text-[11px] text-text-muted">
                  {tr("meta de {goal}", { goal: formatUsage(summary.dailyGoalMinutes * 60) })} · {Math.min(100, Math.round((summary.todaySeconds / (summary.dailyGoalMinutes * 60)) * 100))}%
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-[11px] text-text-faint">{tr("Últimos 7 dias")}</p>
              <p className="text-lg font-semibold text-text">{formatUsage(summary.totalSeconds)}</p>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <p className="text-[11px] text-text-faint">{tr("Sessões concluídas")}</p>
              <p className="text-lg font-semibold text-text">{summary.completedSessions}</p>
            </div>
          </div>

          <DayBars summary={summary} />

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="section-title mb-2">{tr("Por projeto (7 dias)")}</p>
              {summary.byProject.length === 0 ? (
                <p className="text-xs text-text-faint">{tr("Nenhuma sessão nos últimos 7 dias.")}</p>
              ) : (
                <div className="space-y-1.5">
                  {summary.byProject.map((p) => (
                    <div key={p.projectId ?? "none"} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-text">{p.name ?? tr("Sem projeto")}</span>
                      <span className="shrink-0 tabular-nums text-text-muted">{formatUsage(p.seconds)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="section-title mb-2">{tr("Sessões recentes")}</p>
              {summary.recent.length === 0 ? (
                <p className="text-xs text-text-faint">{tr("Nenhuma sessão concluída ainda.")}</p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {summary.recent.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-text">{s.label || s.projectName || tr("Sessão de foco")}</span>
                      <span className="shrink-0 tabular-nums text-text-muted">{formatUsage(s.focusedSeconds)}</span>
                      <span className="w-20 shrink-0 text-right text-[11px] text-text-faint">{timeAgo(s.startedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {prefs && (
            <div className="space-y-3 border-t border-border-subtle pt-4">
              <p className="section-title">{tr("Preferências")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={tr("Duração padrão")}>
                  <select className="input" value={prefs.minutes} onChange={(e) => void update({ focus: { ...prefs, minutes: Number(e.target.value) } })}>
                    {[15, 25, 30, 45, 50, 60, 90].map((m) => (
                      <option key={m} value={m}>
                        {tr("{m}min", { m })}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={tr("Meta diária")} hint={tr("Opcional. Só aparece para você.")}>
                  <select className="input" value={prefs.dailyGoalMinutes} onChange={(e) => void update({ focus: { ...prefs, dailyGoalMinutes: Number(e.target.value) } })}>
                    <option value={0}>{tr("Sem meta")}</option>
                    {[30, 60, 90, 120, 180, 240].map((m) => (
                      <option key={m} value={m}>
                        {formatUsage(m * 60)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm text-text">
                {tr("Avisar quando a sessão terminar")}
                <Switch checked={prefs.notify} onChange={(v) => void update({ focus: { ...prefs, notify: v } })} />
              </label>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Diálogos do foco, montados uma vez no App. */
export function FocusDialogs() {
  return (
    <>
      <StartFocusDialog />
      <FocusHistoryDialog />
    </>
  );
}

/** Card do Início: tempo de hoje, meta e atalho para começar. */
export function FocusCardBody() {
  const { state, readAt, setDialog } = useFocusStore();
  const now = useTick(state.session?.status === "running");
  const summary = useFocusSummary(7, `${state.session?.status}-${state.session?.id}`);
  if (!summary) return <LoadingRows rows={2} />;
  // O resumo foi lido há pouco: soma o que a sessão andou desde então.
  const live = state.session ? liveElapsed(state, readAt, now) - state.elapsedSeconds : 0;
  const today = summary.todaySeconds + Math.max(0, live);
  const goal = summary.dailyGoalMinutes * 60;
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-text">{formatUsage(today)}</p>
          <p className="text-[11px] text-text-faint">{trn(summary.completedSessions, "{n} sessão nos últimos 7 dias", "{n} sessões nos últimos 7 dias")}</p>
        </div>
        {state.session ? (
          <Button size="xs" variant="secondary" onClick={() => setDialog("history")}>
            <Timer size={12} /> {tr("Em andamento")}
          </Button>
        ) : (
          <Button size="xs" onClick={() => setDialog("start")}>
            <Play size={12} /> {tr("Focar")}
          </Button>
        )}
      </div>
      {goal > 0 && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
            <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${Math.min(100, (today / goal) * 100)}%` }} />
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-text-faint">
            <Target size={11} /> {tr("meta de {goal}", { goal: formatUsage(goal) })}
          </p>
        </div>
      )}
    </div>
  );
}
