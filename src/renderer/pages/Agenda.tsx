import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { useCalendarStore } from "@/stores/useCalendarStore";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function Agenda() {
  const { events, load, createEvent, removeEvent, error } = useCalendarStore();
  const [cursor, setCursor] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<string>(toISODate(new Date()));
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("09:00");
  const [location, setLocation] = useState("");

  const { monthStart, monthEnd } = useMemo(() => {
    return {
      monthStart: new Date(cursor.getFullYear(), cursor.getMonth(), 1),
      monthEnd: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0),
    };
  }, [cursor]);

  useEffect(() => {
    void load({
      from: `${toISODate(monthStart)}T00:00:00`,
      to: `${toISODate(monthEnd)}T23:59:59`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const days = useMemo(() => {
    const firstWeekday = monthStart.getDay();
    const totalDays = monthEnd.getDate();
    const cells: (Date | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= totalDays; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    return cells;
  }, [cursor, monthStart, monthEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const ev of events) {
      const day = ev.startsAt.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), ev]);
    }
    return map;
  }, [events]);

  const upcoming = events
    .filter((e) => e.startsAt >= new Date().toISOString().slice(0, 10))
    .slice(0, 8);

  async function handleCreate() {
    const ok = await createEvent({
      title,
      startsAt: `${dialogDate}T${time}:00`,
      location: location || undefined,
    });
    if (ok) {
      setDialogOpen(false);
      setTitle("");
      setLocation("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text">Agenda</h1>
        <Button
          size="sm"
          onClick={() => {
            setDialogDate(toISODate(new Date()));
            setDialogOpen(true);
          }}
        >
          <Plus size={14} /> Novo evento
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft size={16} className="text-text-faint hover:text-text" />
            </button>
            <span className="text-sm font-medium text-text capitalize">
              {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight size={16} className="text-text-faint hover:text-text" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-text-faint">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
            {days.map((day, i) => {
              const iso = day ? toISODate(day) : null;
              const dayEvents = iso ? eventsByDay.get(iso) ?? [] : [];
              const isToday = iso === toISODate(new Date());
              return (
                <button
                  key={i}
                  disabled={!day}
                  onClick={() => {
                    if (!iso) return;
                    setDialogDate(iso);
                    setDialogOpen(true);
                  }}
                  className={cn(
                    "flex h-16 flex-col items-start rounded-md border border-transparent p-1 text-left hover:border-border-subtle",
                    !day && "invisible",
                    isToday && "border-accent/40 bg-accent-muted/40"
                  )}
                >
                  <span className={cn("text-[11px]", isToday ? "text-accent" : "text-text-muted")}>
                    {day?.getDate()}
                  </span>
                  {dayEvents.slice(0, 2).map((ev) => (
                    <span key={ev.id} className="mt-0.5 w-full truncate rounded bg-accent-muted px-1 text-[10px] text-text">
                      {ev.title}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Próximos compromissos
          </h2>
          <div className="space-y-1.5">
            {upcoming.length === 0 && <p className="text-xs text-text-faint">Nada agendado.</p>}
            {upcoming.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between rounded-md border border-border-subtle px-2 py-1.5">
                <div>
                  <p className="text-xs text-text">{ev.title}</p>
                  <p className="text-[11px] text-text-faint">
                    {new Date(ev.startsAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button onClick={() => removeEvent(ev.id)} aria-label="Excluir">
                  <Trash2 size={12} className="text-text-faint hover:text-danger" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Novo evento">
        <div className="space-y-2.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={dialogDate}
              onChange={(e) => setDialogDate(e.target.value)}
              className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-28 rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text"
            />
          </div>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Local (opcional)"
            className="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!title.trim()}>
              Criar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
