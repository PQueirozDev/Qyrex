import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Asterisk, Clock, MemoryStick, RefreshCw, SquareTerminal } from "lucide-react";
import type { SubscriptionLimits, SubscriptionLimitWindow } from "@shared/types";
import { unwrap } from "@/lib/api";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

/**
 * Uso da assinatura dos agentes de código (Claude Code / Codex) na barra de
 * título, com um painel de detalhes: janelas de 5h e da semana, resets e pico.
 * Os números vêm das CLIs oficiais (ver main/integrations/cli/limits.ts).
 */

const POLL_MS = 3 * 60_000;
const MEMORY_MS = 5_000;
const DANGER = 80;

const META = {
  claude: { name: "Claude Code", icon: Asterisk, color: "#D97757" },
  codex: { name: "Codex", icon: SquareTerminal, color: "#5B8DEF" },
} as const;

function levelText(pct: number): string {
  return pct >= DANGER ? "text-danger" : pct >= 50 ? "text-warning" : "text-success";
}

/** "4d 18h", "4h 28m", "18m" até o reset. */
function timeLeft(iso: string | null, now: number): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - now) / 60_000));
  if (mins <= 0) return tr("agora");
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function windowLabel(w: SubscriptionLimitWindow): string {
  if (w.kind === "session") return "5h";
  if (w.kind === "week") return tr("semana");
  return (w.label ?? tr("modelo")).toLowerCase();
}

const session = (l: SubscriptionLimits) => l.windows.find((w) => w.kind === "session") ?? l.windows[0];
const week = (l: SubscriptionLimits) => l.windows.find((w) => w.kind === "week");
const peak = (l: SubscriptionLimits) => Math.max(0, ...l.windows.map((w) => w.usedPercent));

function ProviderIcon({ cli, size = 26 }: { cli: SubscriptionLimits["cli"]; size?: number }) {
  const { icon: Icon, color } = META[cli];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-md"
      style={{ width: size, height: size, background: `${color}26`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      <Icon size={Math.round(size * 0.6)} strokeWidth={2.4} />
    </span>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
      <motion.div
        className="h-full rounded-full"
        style={{ background: pct >= DANGER ? "rgb(var(--danger))" : color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-faint">{label}</div>
      <div className={cn("font-mono text-[13px] font-semibold tabular-nums text-text", className)}>{value}</div>
    </div>
  );
}

function LimitsCard({ limits, now, refreshing, onRefresh }: { limits: SubscriptionLimits; now: number; refreshing: boolean; onRefresh: () => void }) {
  const meta = META[limits.cli];
  const s = session(limits);
  const w = week(limits);
  const top = peak(limits);
  const live = !limits.error && now - new Date(limits.fetchedAt).getTime() < 5 * 60_000;
  const models = limits.windows.filter((x) => x.kind === "model");

  return (
    <div className="flex flex-col rounded-card border border-border-subtle bg-bg p-4">
      <div className="flex items-center gap-2.5">
        <ProviderIcon cli={limits.cli} />
        <span className="min-w-0 truncate text-[15px] font-semibold text-text">{meta.name}</span>
        {limits.plan && (
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] lowercase text-text-muted">{limits.plan}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-text-faint">
          <span className={cn("h-1.5 w-1.5 rounded-full", live ? "animate-pulse" : "bg-text-faint")} style={live ? { background: meta.color } : undefined} />
          {live ? tr("ao vivo") : tr("desatualizado")}
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-md border border-border-subtle p-1.5 text-text-faint transition-colors hover:bg-bg-hover hover:text-text disabled:opacity-60"
          aria-label={tr("Atualizar")}
          title={tr("Atualizar")}
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : undefined} />
        </button>
      </div>

      {limits.error && limits.windows.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          {tr("Não foi possível ler o uso agora.")} <span className="text-text-faint">{limits.error}</span>
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[32px] font-bold leading-none tabular-nums text-text">
                {s ? Math.round(s.usedPercent) : 0}
                <span className="ml-0.5 text-base font-medium text-text-faint">%</span>
              </div>
              <div className="mt-1.5 font-mono text-[11px] text-text-muted">
                {tr("uso 5h")}
                {w && (
                  <>
                    {" · "}
                    <span className="font-semibold text-text">
                      {tr("semana")} {Math.round(w.usedPercent)}%
                    </span>
                  </>
                )}
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[12px] font-semibold tabular-nums text-text">
              <Clock size={12} className="text-text-faint" />
              {timeLeft(s?.resetsAt ?? null, now)}
            </span>
          </div>

          <div className="mt-4 space-y-3.5">
            {limits.windows.map((x) => (
              <div key={`${x.kind}-${x.label ?? ""}`}>
                <div className="mb-1.5 flex items-center justify-between text-[13px] text-text">
                  <span>{windowLabel(x)}</span>
                  <span className="font-mono text-[12px] tabular-nums text-text-muted">{Math.round(x.usedPercent)}%</span>
                </div>
                <Bar pct={x.usedPercent} color={meta.color} />
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-3.5">
              {s && <Stat label={tr("reset 5h")} value={timeLeft(s.resetsAt, now)} />}
              {w && <Stat label={tr("reset semana")} value={timeLeft(w.resetsAt, now)} />}
              {models.map((x) => (
                <Stat key={x.label} label={tr("reset {model}", { model: windowLabel(x) })} value={timeLeft(x.resetsAt, now)} />
              ))}
              {limits.cli === "codex" && (
                <Stat label={tr("status")} value={limits.limited ? tr("limite atingido") : "ok"} className={limits.limited ? "text-danger" : undefined} />
              )}
              {limits.resetCredits !== null && <Stat label={tr("resets grátis")} value={String(limits.resetCredits)} />}
              <Stat label={tr("pico")} value={`${Math.round(top)}%`} className={top >= DANGER ? "text-danger" : undefined} />
            </div>
            <div className="mt-3.5 flex items-center justify-between border-t border-border-subtle pt-3 font-mono text-[11px] text-text-faint">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
                {limits.windows.map(windowLabel).join(" · ")}
              </span>
              <span>
                {tr("pico")} {Math.round(top)}%
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Indicadores da barra de título + painel "Detalhes de uso de IA". */
export function AILimitsIndicator() {
  const [limits, setLimits] = useState<SubscriptionLimits[] | null>(null);
  const [memory, setMemory] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (force = false) => {
    // Silencioso: roda em segundo plano, não deve gerar toast de erro.
    try {
      setLimits(await unwrap(window.workspace.ai.limits(force)));
    } catch {
      // mantém o último valor
    }
  }, []);

  const refreshOne = async (cli: SubscriptionLimits["cli"]) => {
    setRefreshing((r) => new Set(r).add(cli));
    await load(true);
    setRefreshing((r) => {
      const next = new Set(r);
      next.delete(cli);
      return next;
    });
  };

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const read = async () => {
      try {
        setMemory(await unwrap(window.workspace.system.memory()));
      } catch {
        // ignora
      }
    };
    void read();
    const t = setInterval(read, MEMORY_MS);
    return () => clearInterval(t);
  }, []);

  // Relógio das contagens regressivas enquanto o painel está aberto.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    void load();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [open, load]);

  const visible = (limits ?? []).filter((l) => l.available);

  return (
    <>
      {visible.length > 0 && (
        <button
          onClick={() => setOpen(true)}
          title={tr("Uso da assinatura — clique para ver os detalhes")}
          className="flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-bg-hover"
        >
          {visible.map((l) => {
            const s = session(l);
            const pct = s ? Math.round(s.usedPercent) : null;
            return (
              <span key={l.cli} className="flex items-center gap-1.5">
                <ProviderIcon cli={l.cli} size={18} />
                <span className={cn("font-mono text-[12px] font-semibold tabular-nums", pct === null ? "text-text-faint" : levelText(pct))}>
                  {pct === null ? "—" : `${pct}%`}
                </span>
              </span>
            );
          })}
        </button>
      )}
      {memory !== null && (
        <span className="flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-text-muted" title={tr("Memória usada pelo Qyrex")}>
          <MemoryStick size={13} className="text-text-faint" />
          {memory} MB
        </span>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        title={tr("Detalhes de uso de IA")}
        description={tr("Limites atuais, janelas de reset e status da conta dos seus agentes de código conectados.")}
      >
        <div className={cn("grid gap-3 pb-2", visible.length > 1 && "md:grid-cols-2")}>
          {visible.map((l) => (
            <LimitsCard key={l.cli} limits={l} now={now} refreshing={refreshing.has(l.cli)} onRefresh={() => void refreshOne(l.cli)} />
          ))}
        </div>
      </Dialog>
    </>
  );
}
