import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Mascot } from "@/components/ui/Brand";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";
import { BUDDY_TIPS, useBuddyStore, type Mood } from "@/stores/useBuddyStore";
import { runningCount, useRunnerStore } from "@/stores/useRunnerStore";
import { useUIStore } from "@/stores/useUIStore";
// O painel (perguntas, respostas, IA) só carrega quando a capivara é clicada.
const BuddyPanel = lazy(() => import("./BuddyPanel"));

// --- Acessórios em pixel art (desenhados em código, na grade da capivara) ---------------

/** Desenha uma matriz de pixels ("#" = pixel) como SVG nítido. */
function Pixels({ rows, color, size = 2, className }: { rows: string[]; color: string; size?: number; className?: string }) {
  const w = Math.max(...rows.map((r) => r.length));
  return (
    <svg width={w * size} height={rows.length * size} viewBox={`0 0 ${w} ${rows.length}`} shapeRendering="crispEdges" className={className} aria-hidden>
      {rows.flatMap((r, y) => [...r].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} /> : null)))}
    </svg>
  );
}

const Z = ["####", "  # ", " #  ", "####"];
const HEART = [" # # ", "#####", "#####", " ### ", "  #  "];
const DROP = [" # ", "###", "###", " # "];
const BANG = ["#", "#", "#", " ", "#"];
const DOTS = ["# # #"];
const GEAR = [" # # ", "#####", "## ##", "#####", " # # "];
const CONFETTI_COLORS = ["#ff9a3c", "#5dbb4c", "#4ea8ff", "#f5c451", "#e5484d"];

function Accessory({ mood, still }: { mood: Mood; still: boolean }) {
  const float = still ? "" : "animate-float-up";
  switch (mood) {
    case "sleeping":
      return (
        <span className="absolute -top-3 right-0 flex flex-col items-end gap-0.5">
          <Pixels rows={Z} color="rgb(var(--text-muted))" size={2} className={float} />
          <Pixels rows={Z} color="rgb(var(--text-faint))" size={1.5} className={cn(float, "[animation-delay:0.9s]")} />
        </span>
      );
    case "thinking":
      return (
        <span className="absolute -top-4 right-1 rounded-sm border border-border bg-bg-elevated px-1 py-1">
          <Pixels rows={DOTS} color="rgb(var(--text))" size={2} className={still ? "" : "animate-pulse"} />
        </span>
      );
    case "working":
      return <Pixels rows={GEAR} color="rgb(var(--accent))" size={2} className={cn("absolute -top-3 right-1", still ? "" : "animate-spin [animation-duration:2.4s] [animation-timing-function:steps(8)]")} />;
    case "happy":
      return <Pixels rows={HEART} color="#e5484d" size={2} className={cn("absolute -top-4 right-2", float)} />;
    case "celebrating":
      return (
        <span className="absolute -top-5 left-0 right-0 h-6">
          {CONFETTI_COLORS.map((c, i) => (
            <span
              key={c}
              className={cn("absolute h-1 w-1", float)}
              style={{ background: c, left: `${10 + i * 18}%`, top: `${(i % 2) * 6}px`, animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      );
    case "worried":
      return <Pixels rows={DROP} color="#4ea8ff" size={2} className={cn("absolute -top-1 left-1", float)} />;
    case "error":
      return <Pixels rows={BANG} color="#e5484d" size={2} className="absolute -top-4 right-3" />;
    default:
      return null;
  }
}

const MOOD_ANIMATION: Record<Mood, string> = {
  idle: "animate-bob",
  walking: "animate-walk",
  sleeping: "animate-breathe",
  waking: "animate-hop",
  thinking: "animate-bob",
  working: "animate-bob-fast",
  happy: "animate-hop",
  celebrating: "animate-hop",
  worried: "animate-shake",
  error: "animate-shake",
};

function useReducedMotion(): boolean {
  const pref = useBuddyStore((s) => s.prefs.reducedMotion);
  const [system, setSystem] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setSystem(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return pref === "on" || (pref === "auto" && system);
}

const SLEEP_AFTER = 4 * 60_000;

/**
 * A capivara do Qyrex no canto da tela: reage ao que acontece no app (tarefas,
 * builds, foco, inatividade), fala pouco e abre um painel de ajuda ao clicar.
 */
export function CapyBuddy() {
  const { prefs, mood, message, setMood, say, dismiss } = useBuddyStore();
  const processes = useRunnerStore((s) => s.processes);
  const initRunner = useRunnerStore((s) => s.init);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion() || !prefs.animations;
  const lastActivity = useRef(Date.now());
  const working = runningCount(processes) > 0;

  useEffect(() => initRunner(), [initRunner]);

  // Dorme depois de alguns minutos sem mexer no app; acorda com qualquer tecla ou movimento.
  useEffect(() => {
    if (!prefs.enabled) return;
    const wake = () => {
      lastActivity.current = Date.now();
      if (useBuddyStore.getState().mood === "sleeping") setMood("waking");
    };
    const check = window.setInterval(() => {
      const m = useBuddyStore.getState().mood;
      if (Date.now() - lastActivity.current > SLEEP_AFTER && (m === "idle" || m === "working")) setMood("sleeping");
      else if (m === "idle" && Math.random() < 0.08 && !reduced) setMood("walking");
    }, 20_000);
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("keydown", wake);
    return () => {
      window.clearInterval(check);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [prefs.enabled, reduced, setMood]);

  // Dicas só no modo "falar tudo", uma a cada ~25 min.
  useEffect(() => {
    if (!prefs.enabled || prefs.frequency !== "all") return;
    const t = window.setInterval(() => say(BUDDY_TIPS[Math.floor(Math.random() * BUDDY_TIPS.length)]()), 25 * 60_000);
    return () => window.clearInterval(t);
  }, [prefs.enabled, prefs.frequency, say]);

  const shownMood: Mood = mood === "idle" && working ? "working" : mood;
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const side = prefs.position === "bottom-left" ? (collapsed ? "left-[72px]" : "left-[236px]") : "right-4";
  const bubbleSide = prefs.position === "bottom-left" ? "left-0" : "right-0";
  const label = useMemo(() => tr("Capivara assistente"), []);

  if (!prefs.enabled) return null;

  return (
    <div className={cn("fixed bottom-9 z-30 flex flex-col items-end", side, prefs.position === "bottom-left" && "items-start")}>
      {open && (
        <div className={cn("absolute bottom-full mb-2", bubbleSide)}>
          <Suspense fallback={null}>
            <BuddyPanel onClose={() => setOpen(false)} />
          </Suspense>
        </div>
      )}
      {!open && message && (
        <button
          onClick={dismiss}
          className={cn("absolute bottom-full mb-1 w-max max-w-[260px] animate-pop-in rounded-xl border border-border bg-bg-elevated px-3 py-2 text-left text-[12px] leading-snug text-text shadow-pop", bubbleSide)}
          aria-live="polite"
        >
          {message}
        </button>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="press relative rounded-lg p-1 opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-2"
        aria-label={label}
        aria-expanded={open}
        title={label}
      >
        <span className={cn("relative block", !reduced && MOOD_ANIMATION[shownMood], shownMood === "sleeping" && "opacity-80")}>
          <Mascot scale={2} bob={false} className={shownMood === "sleeping" ? "[filter:saturate(0.7)]" : undefined} />
        </span>
        <Accessory mood={shownMood} still={reduced} />
      </button>
    </div>
  );
}

/** Liga a capivara aos eventos reais do app (tarefas, runner, foco). Montado uma vez no App. */
export function useBuddyEvents() {
  const react = useBuddyStore((s) => s.react);
  const processes = useRunnerStore((s) => s.processes);
  const seen = useRef(new Map<string, string>());

  // Runner: build/teste/lint que termina bem comemora; que falha preocupa.
  useEffect(() => {
    for (const p of processes) {
      const key = `${p.status}-${p.startedAt}`;
      const before = seen.current.get(p.id);
      seen.current.set(p.id, key);
      if (before === undefined || before === key || before.startsWith(`${p.status}-`)) continue;
      const name = p.script ?? p.command;
      const check = /^(build|test|lint|typecheck|check|ci)(:|$)/.test(p.script ?? "") || /\b(build|test|lint|tsc)\b/.test(p.command);
      if (p.status === "exited" && check) react({ kind: "buildOk", name });
      else if (p.status === "failed") react(check ? { kind: "buildFail", name } : { kind: "processFail", name });
    }
  }, [processes, react]);

  // Foco: começar e terminar.
  useEffect(() => {
    let last: string | null = null;
    return window.workspace.focus.onChange((state) => {
      const status = state.session?.status ?? null;
      if (status === "running" && last === null && state.session) react({ kind: "focusStart", minutes: state.session.plannedMinutes });
      if (status === null && last !== null && last !== "paused") react({ kind: "focusEnd" });
      last = status;
    });
  }, [react]);
}
