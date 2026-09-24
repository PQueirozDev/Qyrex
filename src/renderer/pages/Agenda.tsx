import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Lock, MapPin, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { CalendarEvent } from "@shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, EmptyState, ErrorState, Field, PageHeader, Segmented, Spinner } from "@/components/ui/primitives";
import { attempt } from "@/lib/api";
import { cn } from "@/lib/cn";
import { addDays, formatTime, parseLocalDate, parseLocalDateTime, todayISO, toLocalDate } from "@/lib/format";
import { useCalendarStore } from "@/stores/useCalendarStore";
import { confirmAction, toast, useUIStore } from "@/stores/useUIStore";

type View = "dia" | "semana" | "mes";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay());
}

function rangeFor(view: View, cursor: Date): { days: string[]; from: string; to: string } {
  let first: Date;
  let count: number;
  if (view === "dia") {
    first = cursor;
    count = 1;
  } else if (view === "semana") {
    first = startOfWeek(cursor);
    count = 7;
  } else {
    first = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    count = 42;
  }
  const days = Array.from({ length: count }, (_, i) => toLocalDate(addDays(first, i)));
  return { days, from: `${days[0]}T00:00:00`, to: `${days[days.length - 1]}T23:59:59` };
}

/** Evento aparece em todos os dias que ele cobre (eventos de vários dias). */
function occursOn(e: CalendarEvent, day: string): boolean {
  return e.startsAt.slice(0, 10) <= day && (e.endsAt ?? e.startsAt).slice(0, 10) >= day;
}

function isAllDay(e: CalendarEvent): boolean {
  return e.startsAt.slice(11, 16) === "00:00" && (!e.endsAt || e.endsAt.slice(11, 16) === "23:59");
}

function timeLabel(e: CalendarEvent): string {
  if (isAllDay(e)) return "Dia todo";
  return e.endsAt && e.endsAt.slice(0, 10) === e.startsAt.slice(0, 10) ? `${formatTime(e.startsAt)}–${formatTime(e.endsAt)}` : formatTime(e.startsAt);
}

function EventChip({ event, onClick, compact }: { event: CalendarEvent; onClick: () => void; compact?: boolean }) {
  const google = event.source === "google";
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      title={`${event.title}${event.location ? ` · ${event.location}` : ""}`}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-md border px-1.5 text-left transition-colors",
        compact ? "py-px text-[11px]" : "py-1 text-xs",
        google ? "border-success/25 bg-success/10 text-text hover:bg-success/15" : "border-accent/25 bg-accent/10 text-text hover:bg-accent/15"
      )}
    >
      {!isAllDay(event) && <span className="shrink-0 text-text-faint">{formatTime(event.startsAt)}</span>}
      <span className="truncate">{event.title}</span>
    </button>
  );
}

// --- Diálogo ------------------------------------------------------------------------

interface Draft {
  date: string;
  time?: string;
}

function EventDialog({ open, event, draft, onClose }: { open: boolean; event: CalendarEvent | null; draft: Draft | null; onClose: () => void }) {
  const { create, update, remove } = useCalendarStore();
  const readOnly = event?.source === "google";

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setDate(event.startsAt.slice(0, 10));
      setAllDay(isAllDay(event));
      setStart(formatTime(event.startsAt));
      setEnd(event.endsAt ? formatTime(event.endsAt) : "");
      setEndDate(event.endsAt ? event.endsAt.slice(0, 10) : event.startsAt.slice(0, 10));
      setLocation(event.location ?? "");
      setDescription(event.description ?? "");
    } else {
      const d = draft?.date ?? todayISO();
      const t = draft?.time ?? "09:00";
      const h = Math.min(23, Number(t.slice(0, 2)) + 1);
      setTitle("");
      setDate(d);
      setEndDate(d);
      setAllDay(false);
      setStart(t);
      setEnd(`${String(h).padStart(2, "0")}:${t.slice(3, 5)}`);
      setLocation("");
      setDescription("");
    }
  }, [open, event, draft]);

  const startsAt = `${date}T${allDay ? "00:00" : start}:00`;
  const endsAt = allDay ? `${endDate || date}T23:59:00` : end ? `${endDate || date}T${end}:00` : null;
  const invalid = !title.trim() || !date || (!allDay && !start) || (endsAt !== null && endsAt < startsAt);

  async function save() {
    if (invalid || readOnly) return;
    setSaving(true);
    const ok = event
      ? await update(event.id, { title: title.trim(), startsAt, endsAt, location: location.trim() || null, description: description.trim() || null })
      : await create({
          title: title.trim(),
          startsAt,
          endsAt: endsAt ?? undefined,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
        });
    setSaving(false);
    if (ok) onClose();
  }

  async function handleDelete() {
    if (!event) return;
    const ok = await confirmAction({ title: `Excluir "${event.title}"?`, description: "Essa ação não pode ser desfeita.", danger: true, confirmLabel: "Excluir" });
    if (!ok) return;
    await remove(event.id);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissable={readOnly}
      title={readOnly ? event?.title : event ? "Editar evento" : "Novo evento"}
      description={readOnly ? "Evento do Google Agenda — somente leitura. Edite pelo Google Agenda e sincronize." : undefined}
      footer={
        readOnly ? (
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            {event && (
              <Button size="sm" variant="danger" className="mr-auto" onClick={() => void handleDelete()}>
                <Trash2 size={13} /> Excluir
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={invalid} loading={saving}>
              {event ? "Salvar" : "Criar evento"}
            </Button>
          </>
        )
      }
    >
      <fieldset disabled={readOnly} className="space-y-3">
        <input className="input text-[15px] font-medium" placeholder="Título do evento" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <input type="date" className="input" value={date} onChange={(e) => {
              setDate(e.target.value);
              if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
            }} />
          </Field>
          <Field label="Término">
            <input type="date" className="input" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          {!allDay && (
            <>
              <Field label="Hora de início">
                <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Hora de término">
                <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
            </>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" className="accent-accent" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Dia inteiro
        </label>
        {endsAt !== null && endsAt < startsAt && <p className="text-xs text-danger">O término precisa ser depois do início.</p>}
        <Field label="Local">
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Opcional" />
        </Field>
        <Field label="Descrição">
          <textarea className="input min-h-[70px] resize-y" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </fieldset>
    </Dialog>
  );
}

// --- Visões ----------------------------------------------------------------------------

function MonthView({
  days,
  month,
  events,
  onCreate,
  onOpen,
}: {
  days: string[];
  month: number;
  events: CalendarEvent[];
  onCreate: (d: Draft) => void;
  onOpen: (e: CalendarEvent) => void;
}) {
  const today = todayISO();
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border-subtle">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-text-faint">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const date = parseLocalDate(day);
          const items = events.filter((e) => occursOn(e, day));
          return (
            <div
              key={day}
              onClick={() => onCreate({ date: day })}
              className={cn(
                "group min-h-[96px] cursor-pointer border-border-subtle p-1.5 transition-colors hover:bg-bg-hover/40",
                i % 7 !== 6 && "border-r",
                i < 35 && "border-b",
                date.getMonth() !== month && "bg-bg/40"
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]",
                    day === today ? "bg-accent font-semibold text-accent-fg" : date.getMonth() === month ? "text-text" : "text-text-faint"
                  )}
                >
                  {date.getDate()}
                </span>
                <Plus size={11} className="text-text-faint opacity-0 group-hover:opacity-100" />
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} compact onClick={() => onOpen(e)} />
                ))}
                {items.length > 3 && <p className="px-1 text-[10px] text-text-faint">+{items.length - 3} mais</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeekView({ days, events, onCreate, onOpen }: { days: string[]; events: CalendarEvent[]; onCreate: (d: Draft) => void; onOpen: (e: CalendarEvent) => void }) {
  const today = todayISO();
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const date = parseLocalDate(day);
        const items = events.filter((e) => occursOn(e, day));
        return (
          <Card
            key={day}
            onClick={() => onCreate({ date: day })}
            className={cn("group min-h-[320px] cursor-pointer p-2 transition-colors hover:border-border", day === today && "border-accent/40")}
          >
            <div className="mb-2 flex items-baseline justify-between px-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-faint">{WEEKDAYS[date.getDay()]}</span>
              <span className={cn("text-sm font-semibold", day === today ? "text-accent" : "text-text")}>{date.getDate()}</span>
            </div>
            <div className="space-y-1">
              {items.map((e) => (
                <EventChip key={e.id} event={e} onClick={() => onOpen(e)} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DayView({ day, events, onCreate, onOpen }: { day: string; events: CalendarEvent[]; onCreate: (d: Draft) => void; onOpen: (e: CalendarEvent) => void }) {
  const items = events.filter((e) => occursOn(e, day));
  const allDay = items.filter((e) => isAllDay(e) || e.startsAt.slice(0, 10) < day);
  const timed = items.filter((e) => !allDay.includes(e));
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => (h >= 7 && h <= 22) || timed.some((e) => parseLocalDateTime(e.startsAt).getHours() === h));

  return (
    <Card className="overflow-hidden">
      {allDay.length > 0 && (
        <div className="space-y-1 border-b border-border-subtle p-3">
          <p className="section-title">Dia todo</p>
          {allDay.map((e) => (
            <EventChip key={e.id} event={e} onClick={() => onOpen(e)} />
          ))}
        </div>
      )}
      <div className="divide-y divide-border-subtle">
        {hours.map((h) => {
          const slot = timed.filter((e) => parseLocalDateTime(e.startsAt).getHours() === h);
          const label = `${String(h).padStart(2, "0")}:00`;
          return (
            <div key={h} onClick={() => onCreate({ date: day, time: label })} className="group flex min-h-[44px] cursor-pointer gap-3 px-3 py-1.5 hover:bg-bg-hover/40">
              <span className="w-12 shrink-0 pt-1 text-right text-[11px] text-text-faint">{label}</span>
              <div className="flex-1 space-y-1">
                {slot.map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(e);
                    }}
                    className={cn(
                      "block w-full rounded-md border px-2.5 py-1.5 text-left transition-colors",
                      e.source === "google" ? "border-success/25 bg-success/10 hover:bg-success/15" : "border-accent/25 bg-accent/10 hover:bg-accent/15"
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm text-text">
                      {e.title}
                      {e.source === "google" && <Lock size={11} className="text-text-faint" />}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-text-muted">
                      {timeLabel(e)}
                      {e.location && (
                        <span className="flex items-center gap-0.5">
                          <MapPin size={10} /> {e.location}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// --- Página ------------------------------------------------------------------------------

export function Agenda() {
  const { events, loading, error, load } = useCalendarStore();
  const pageParam = useUIStore((s) => s.pageParam);
  const navigate = useUIStore((s) => s.navigate);

  const [view, setView] = useState<View>("mes");
  const [cursor, setCursor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const range = useMemo(() => rangeFor(view, cursor), [view, cursor]);

  useEffect(() => {
    void load({ from: range.from, to: range.to });
  }, [load, range.from, range.to]);

  useEffect(() => {
    void attempt(window.workspace.integrations.list()).then((list) =>
      setGoogleConnected(list?.some((i) => i.id === "google_calendar" && i.state === "connected") ?? false)
    );
  }, []);

  useEffect(() => {
    if (pageParam === "new") {
      openCreate({ date: todayISO() });
      navigate("agenda");
    }
  }, [pageParam, navigate]);

  function openCreate(d: Draft) {
    setEditing(null);
    setDraft(d);
    setDialogOpen(true);
  }

  function openEvent(e: CalendarEvent) {
    setEditing(e);
    setDraft(null);
    setDialogOpen(true);
  }

  function move(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === "dia") d.setDate(d.getDate() + dir);
    else if (view === "semana") d.setDate(d.getDate() + 7 * dir);
    else d.setMonth(d.getMonth() + dir, 1);
    setCursor(d);
  }

  async function syncGoogle() {
    setSyncing(true);
    const count = await attempt(window.workspace.googleCalendar.sync());
    setSyncing(false);
    if (count !== undefined) {
      toast.success(`Google Agenda sincronizado: ${count} evento(s)`);
      void load();
    }
  }

  const title =
    view === "dia"
      ? cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : view === "semana"
        ? `${parseLocalDate(range.days[0]).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${parseLocalDate(range.days[6]).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`
        : cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const upcoming = events.filter((e) => (e.endsAt ?? e.startsAt) >= `${todayISO()}T00:00:00`).slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Compromissos locais e do Google Agenda (somente leitura)."
        actions={
          <>
            {googleConnected ? (
              <Button size="sm" variant="secondary" onClick={() => void syncGoogle()} loading={syncing}>
                {!syncing && <RefreshCw size={13} />} Sincronizar Google
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => navigate("integracoes")}>
                Conectar Google Agenda
              </Button>
            )}
            <Button size="sm" onClick={() => openCreate({ date: toLocalDate(cursor) })}>
              <Plus size={14} /> Novo evento
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Anterior">
          <ChevronLeft size={16} />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="Próximo">
          <ChevronRight size={16} />
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setCursor(new Date())}>
          Hoje
        </Button>
        <h2 className="ml-1 text-sm font-semibold capitalize text-text">{title}</h2>
        {loading && <Spinner />}
        <Segmented
          className="ml-auto"
          value={view}
          onChange={setView}
          options={[
            { value: "dia", label: "Dia" },
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mês" },
          ]}
        />
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      <div className={cn("grid gap-4", view === "mes" && "xl:grid-cols-[minmax(0,1fr)_260px]")}>
        {view === "mes" && <MonthView days={range.days} month={cursor.getMonth()} events={events} onCreate={openCreate} onOpen={openEvent} />}
        {view === "semana" && <WeekView days={range.days} events={events} onCreate={openCreate} onOpen={openEvent} />}
        {view === "dia" && <DayView day={range.days[0]} events={events} onCreate={openCreate} onOpen={openEvent} />}

        {view === "mes" && (
          <Card className="h-fit p-3">
            <p className="section-title mb-2">Próximos neste mês</p>
            {upcoming.length === 0 ? (
              <EmptyState className="py-6" icon={CalendarDays} title="Nada por vir" />
            ) : (
              <div className="space-y-2">
                {upcoming.map((e) => (
                  <button key={e.id} onClick={() => openEvent(e)} className="block w-full rounded-md px-1.5 py-1 text-left hover:bg-bg-hover">
                    <div className="flex items-center gap-1.5 text-sm text-text">
                      <span className="truncate">{e.title}</span>
                      {e.source === "google" && <Badge tone="success">Google</Badge>}
                    </div>
                    <div className="text-[11px] capitalize text-text-faint">
                      {parseLocalDate(e.startsAt).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })} · {timeLabel(e)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      <EventDialog open={dialogOpen} event={editing} draft={draft} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
