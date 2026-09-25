import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownToLine, ArrowUpFromLine, BarChart3, Coins, Trash2 } from "lucide-react";
import type { AIProviderId, AIUsageSummary } from "@shared/types";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, EmptyState, ErrorState, LoadingRows, Segmented } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { attempt, errorMessage, unwrap } from "@/lib/api";
import { getLocale, tr } from "@/lib/i18n";
import { formatDate, parseLocalDate, timeAgo } from "@/lib/format";
import { confirmAction } from "@/stores/useUIStore";
import { AnimatedValue } from "@/components/ui/AnimatedValue";

type Period = "1" | "7" | "30" | "all";

const PROVIDER_LABEL: Record<AIProviderId, string> = { anthropic: "Claude", openai: "OpenAI", google: "Gemini" };
const SOURCE_LABEL = { chat: tr("Chat"), council: tr("AI Council"), synthesis: tr("Síntese") } as const;

const compact = (n: number) => n.toLocaleString(getLocale(), { notation: "compact", maximumFractionDigits: 1 });
const full = (n: number) => n.toLocaleString(getLocale());

/** US$ com precisão maior para valores pequenos (uma resposta costuma custar centavos). */
export function formatUsd(value: number): string {
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return value.toLocaleString(getLocale(), { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Coins; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon size={14} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-text">
        <AnimatedValue value={value} />
      </p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-text-faint">{sub}</p>}
    </div>
  );
}

/**
 * Barras de tokens por dia (série única, cor de destaque do tema).
 * Barras finas com topo arredondado apoiadas na base, 2px de respiro entre elas,
 * grade discreta e tooltip por barra com o detalhamento.
 */
function DailyChart({ days }: { days: AIUsageSummary["byDay"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 180;
  const pad = { top: 8, right: 8, bottom: 22, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const totals = days.map((d) => d.inputTokens + d.outputTokens);
  const max = Math.max(...totals, 1);
  // Escala "redonda" para a grade (1, 2, 5 × 10^n).
  const step = (() => {
    const raw = max / 3;
    const pow = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  })();
  const top = step * Math.ceil(max / step);
  const slot = innerW / days.length;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const labelEvery = Math.ceil(days.length / 8);

  const bar = (x: number, h: number) => {
    // Topo arredondado (4px), base reta na linha de base.
    const r = Math.min(4, barW / 2, h);
    const yTop = pad.top + innerH - h;
    const yBase = pad.top + innerH;
    return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yBase} Z`;
  };

  const hovered = hover !== null ? days[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={tr("Tokens por dia")}>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => {
          const v = step * i;
          return (
            <g key={i}>
              <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} className="stroke-border-subtle" strokeWidth={1} />
              <text x={pad.left - 6} y={y(v) + 3} textAnchor="end" className="fill-text-faint text-[10px]">
                {compact(v)}
              </text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const total = totals[i];
          const h = total > 0 ? Math.max(2, (total / top) * innerH) : 0;
          const x = pad.left + i * slot + (slot - barW) / 2;
          return (
            <g key={d.date}>
              {h > 0 && <path d={bar(x, h)} className={cn("fill-accent transition-opacity", hover !== null && hover !== i && "opacity-40")} />}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="fill-text-faint text-[10px]">
                  {formatDate(d.date)}
                </text>
              )}
              {/* Área de hover maior que a barra, cobrindo a coluna inteira. */}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-52 -translate-x-1/2 rounded-lg border border-border bg-bg-elevated p-2.5 text-xs shadow-pop"
          style={{ left: `${((pad.left + hover * slot + slot / 2) / W) * 100}%` }}
        >
          <p className="font-medium text-text">
            {parseLocalDate(hovered.date).toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short" })}
          </p>
          <div className="mt-1.5 space-y-0.5 text-text-muted">
            <div className="flex justify-between">
              <span>{tr("Entrada")}</span>
              <span className="tabular-nums text-text">{full(hovered.inputTokens)}</span>
            </div>
            <div className="flex justify-between">
              <span>{tr("Saída")}</span>
              <span className="tabular-nums text-text">{full(hovered.outputTokens)}</span>
            </div>
            {Object.entries(hovered.byProvider).map(([p, n]) => (
              <div key={p} className="flex justify-between text-text-faint">
                <span>{PROVIDER_LABEL[p as AIProviderId] ?? p}</span>
                <span className="tabular-nums">{full(n)}</span>
              </div>
            ))}
            {hovered.costUsd > 0 && (
              <div className="flex justify-between border-t border-border-subtle pt-1">
                <span>{tr("Custo estimado")}</span>
                <span className="tabular-nums text-text">{formatUsd(hovered.costUsd)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Aba "Uso" da Central de IA: tokens, custo estimado, por modelo e por dia. */
export function AIUsageView() {
  const [period, setPeriod] = useState<Period>("30");
  const [data, setData] = useState<AIUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await unwrap(window.workspace.ai.usage.summary(period === "all" ? null : Number(period))));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  async function clear() {
    const ok = await confirmAction({
      title: tr("Apagar o histórico de uso da IA?"),
      description: tr("Só os contadores de tokens são apagados. Conversas não são afetadas."),
      danger: true,
      confirmLabel: tr("Apagar histórico"),
    });
    if (!ok) return;
    if ((await attempt(window.workspace.ai.usage.clear(true), tr("Histórico de uso apagado"))) !== undefined) void load();
  }

  const t = data?.totals;
  const periodLabel = useMemo(
    () => ({ "1": tr("hoje"), "7": tr("nos últimos 7 dias"), "30": tr("nos últimos 30 dias"), all: tr("desde o início") })[period],
    [period]
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-text">{tr("Uso da IA")}</h2>
            <p className="mt-0.5 text-sm text-text-muted">
              {tr("Tokens e custo estimado de chat, AI Council e sínteses. Tudo fica só neste computador.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: "1", label: tr("Hoje") },
                { value: "7", label: tr("7 dias") },
                { value: "30", label: tr("30 dias") },
                { value: "all", label: tr("Tudo") },
              ]}
            />
            <Button size="sm" variant="ghost" onClick={() => void clear()} disabled={!t || t.requests === 0} title={tr("Apagar histórico")}>
              <Trash2 size={13} />
            </Button>
          </div>
        </div>

        {error && <ErrorState message={error} onRetry={() => void load()} />}

        {loading && !data ? (
          <LoadingRows rows={4} />
        ) : !t || t.requests === 0 ? (
          <Card>
            <EmptyState
              icon={BarChart3}
              title={tr("Nenhum uso registrado {period}", { period: periodLabel })}
              description={tr("Cada resposta do chat, do AI Council e das sínteses entra aqui com a contagem de tokens informada pelo provider.")}
            />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Tile icon={Activity} label={tr("Requisições")} value={full(t.requests)} sub={periodLabel} />
              <Tile
                icon={ArrowDownToLine}
                label={tr("Tokens de entrada")}
                value={compact(t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens)}
                sub={t.cacheReadTokens > 0 ? tr("{n} lidos do cache", { n: compact(t.cacheReadTokens) }) : tr("Pergunta, histórico e anexos")}
              />
              <Tile icon={ArrowUpFromLine} label={tr("Tokens de saída")} value={compact(t.outputTokens)} sub={tr("Respostas geradas")} />
              <Tile
                icon={Coins}
                label={tr("Custo estimado")}
                value={formatUsd(t.costUsd)}
                sub={t.unpricedRequests > 0 ? tr("{n} sem preço conhecido", { n: t.unpricedRequests }) : tr("Preços de tabela, sem impostos")}
              />
            </div>

            {data.byDay.length > 1 && (
              <Card>
                <CardHeader title={tr("Tokens por dia")} icon={<BarChart3 size={12} />} />
                <CardContent>
                  <DailyChart days={data.byDay} />
                </CardContent>
              </Card>
            )}

            <Card className="overflow-hidden">
              <CardHeader title={tr("Por modelo")} />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-y border-border-subtle text-[11px] uppercase tracking-wider text-text-faint">
                      <th className="px-4 py-2 font-medium">{tr("Modelo")}</th>
                      <th className="px-4 py-2 text-right font-medium">{tr("Requisições")}</th>
                      <th className="px-4 py-2 text-right font-medium">{tr("Entrada")}</th>
                      <th className="px-4 py-2 text-right font-medium">{tr("Saída")}</th>
                      <th className="px-4 py-2 text-right font-medium">{tr("Custo estimado")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {data.byModel.map((m) => (
                      <tr key={`${m.provider}-${m.model}`} className="text-text">
                        <td className="px-4 py-2">
                          <span className="font-mono text-xs">{m.model}</span>
                          <span className="ml-2 text-[11px] text-text-faint">{PROVIDER_LABEL[m.provider]}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{full(m.requests)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{full(m.inputTokens + m.cacheReadTokens + m.cacheWriteTokens)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{full(m.outputTokens)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {m.unpricedRequests === m.requests ? <span className="text-text-faint">—</span> : formatUsd(m.costUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {t.unpricedRequests > 0 && (
                <p className="border-t border-border-subtle px-4 py-2 text-[11px] text-text-faint">
                  {tr("Custo estimado só para modelos com preço conhecido (Claude). OpenAI e Gemini mostram só os tokens.")}
                </p>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title={tr("Últimas requisições")} />
              <div className="divide-y divide-border-subtle">
                {data.recent.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px]">
                    <span className="w-20 shrink-0 text-[11px] text-text-faint">{timeAgo(r.createdAt)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-text">{PROVIDER_LABEL[r.provider]}</span>{" "}
                      <span className="font-mono text-xs text-text-muted">{r.model}</span>
                    </span>
                    <Badge>{SOURCE_LABEL[r.source]}</Badge>
                    {r.estimated && <Badge tone="warning">{tr("Estimado")}</Badge>}
                    {r.aborted && <Badge>{tr("Interrompida")}</Badge>}
                    <span className="w-44 text-right text-xs tabular-nums text-text-muted">
                      {tr("{input} → {output} tokens", {
                        input: compact(r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens),
                        output: compact(r.outputTokens),
                      })}
                    </span>
                    <span className="w-20 text-right text-xs tabular-nums text-text">{r.costUsd === null ? "—" : formatUsd(r.costUsd)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
