import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { LocalMediaState, MediaAction } from "@shared/types";
import { formatDuration } from "@/lib/format";
import { toast, useUIStore } from "@/stores/useUIStore";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;

/** Barrinhas de equalizador animadas enquanto toca. */
function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn("w-[2.5px] rounded-full bg-accent", playing ? "animate-eq" : "h-[3px]")}
          style={playing ? { animationDelay: `${i * 0.13}s` } : undefined}
        />
      ))}
    </span>
  );
}

function Cover({ url, size }: { url: string | null; size: number }) {
  return url ? (
    <motion.img layout src={url} alt="" className="shrink-0 rounded-[10px] object-cover shadow-md" style={{ width: size, height: size }} transition={SPRING} />
  ) : (
    <motion.div
      layout
      transition={SPRING}
      className="flex shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg"
      style={{ width: size, height: size }}
    >
      <Music2 size={size / 2.4} />
    </motion.div>
  );
}

/**
 * Mini player "ilha": pílula compacta com a música tocando no PC (Spotify ou
 * outro player, via sessões de mídia do Windows). Clicar expande para o card
 * com progresso e controles. Atualiza só com a janela visível.
 */
export function MiniPlayer() {
  const online = useUIStore((s) => s.online);
  const [media, setMedia] = useState<LocalMediaState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const lastSync = useRef(Date.now());

  const refresh = useCallback(async () => {
    const res = await window.workspace.media.state();
    setLoaded(true);
    if (!res.ok) return;
    setMedia(res.data);
    lastSync.current = Date.now();
    if (!dragging) setProgress(res.data?.positionMs ?? 0);
  }, [dragging]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  // Progresso fluido entre uma consulta e outra.
  useEffect(() => {
    if (!media?.isPlaying || dragging) return;
    const base = media.positionMs;
    const t = setInterval(() => setProgress(Math.min(base + (Date.now() - lastSync.current), media.durationMs || Infinity)), 250);
    return () => clearInterval(t);
  }, [media, dragging]);

  async function control(action: MediaAction) {
    if (media && (action === "toggle" || action === "play" || action === "pause")) setMedia({ ...media, isPlaying: !media.isPlaying });
    const res = await window.workspace.media.control(action);
    if (!res.ok) toast.error(res.error);
    setTimeout(() => void refresh(), 350);
  }

  function seekFromEvent(clientX: number, commit: boolean) {
    const el = barRef.current;
    if (!el || !media?.durationMs) return;
    const rect = el.getBoundingClientRect();
    const ms = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * media.durationMs;
    setProgress(ms);
    if (commit) {
      lastSync.current = Date.now();
      setMedia({ ...media, positionMs: ms });
      void window.workspace.media.seek(Math.round(ms)).then((r) => !r.ok && toast.error(r.error));
    }
  }

  if (!loaded) return <div className="h-[58px] border-t border-border-subtle" />;

  if (!media) {
    return (
      <div className="border-t border-border-subtle p-2.5">
        <button
          onClick={() => void window.workspace.system.openSpotifyApp()}
          className="press flex w-full items-center gap-2.5 rounded-full border border-border-subtle bg-bg px-2 py-1.5 text-[11px] text-text-faint hover:border-border hover:text-text-muted"
          title={online ? tr("Abrir o Spotify") : undefined}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-hover">
            <Music2 size={12} />
          </span>
          {tr("Nada tocando agora")}
        </button>
      </div>
    );
  }

  const pct = media.durationMs ? Math.min(100, (progress / media.durationMs) * 100) : 0;

  return (
    <div className="border-t border-border-subtle p-2.5">
      <motion.div
        layout
        transition={SPRING}
        onClick={() => !expanded && setExpanded(true)}
        className={cn(
          "relative overflow-hidden bg-[#0b0b0d] text-white shadow-[0_10px_30px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/5",
          expanded ? "cursor-default" : "press cursor-pointer"
        )}
        style={{ borderRadius: expanded ? 18 : 999 }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {!expanded ? (
            <motion.div
              key="pill"
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              className="flex items-center gap-2.5 py-1.5 pl-1.5 pr-3"
            >
              <Cover url={media.coverUrl} size={30} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[12px] font-semibold">{media.title}</p>
                <p className="truncate text-[10.5px] text-white/55">{media.artist}</p>
              </div>
              <Equalizer playing={media.isPlaying} />
            </motion.div>
          ) : (
            <motion.div
              key="card"
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              className="p-3"
            >
              <div className="flex items-center gap-2.5">
                <Cover url={media.coverUrl} size={42} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-semibold" title={media.title}>
                    {media.title}
                  </p>
                  <p className="truncate text-[11px] text-white/55" title={media.album ? `${media.artist} — ${media.album}` : media.artist}>
                    {media.artist}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(false);
                  }}
                  className="press rounded-full p-1"
                  aria-label={tr("Recolher player")}
                  title={tr("Recolher player")}
                >
                  <Equalizer playing={media.isPlaying} />
                </button>
              </div>

              <div
                ref={barRef}
                className={cn("group mt-3 py-1.5", media.canSeek && "cursor-pointer")}
                onPointerDown={(e) => {
                  if (!media.canSeek) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(true);
                  seekFromEvent(e.clientX, false);
                }}
                onPointerMove={(e) => dragging && seekFromEvent(e.clientX, false)}
                onPointerUp={(e) => {
                  if (!dragging) return;
                  setDragging(false);
                  seekFromEvent(e.clientX, true);
                }}
              >
                <div className="relative h-[3px] rounded-full bg-white/15 transition-[height] duration-150 group-hover:h-[5px]">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct}%` }} />
                  <div
                    className={cn(
                      "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform duration-150",
                      dragging ? "scale-110" : "scale-0 group-hover:scale-100"
                    )}
                    style={{ left: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-[10px] tabular-nums text-white/45">
                <span>{formatDuration(progress)}</span>
                <span>-{formatDuration(Math.max(0, media.durationMs - progress))}</span>
              </div>

              <div className="mt-1.5 flex items-center justify-center gap-4">
                <button
                  disabled={!media.canPrevious}
                  onClick={() => void control("previous")}
                  className="press rounded-full p-1.5 text-white/80 hover:text-white disabled:opacity-30"
                  aria-label={tr("Anterior")}
                >
                  <SkipBack size={16} fill="currentColor" />
                </button>
                <button
                  onClick={() => void control("toggle")}
                  className="press flex h-9 w-9 items-center justify-center rounded-full bg-white text-black hover:scale-105"
                  aria-label={media.isPlaying ? tr("Pausar") : tr("Tocar")}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={media.isPlaying ? "pause" : "play"}
                      initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{ scale: 0.4, opacity: 0, rotate: 30 }}
                      transition={{ duration: 0.16 }}
                    >
                      {media.isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="translate-x-px" />}
                    </motion.span>
                  </AnimatePresence>
                </button>
                <button
                  disabled={!media.canNext}
                  onClick={() => void control("next")}
                  className="press rounded-full p-1.5 text-white/80 hover:text-white disabled:opacity-30"
                  aria-label={tr("Próxima")}
                >
                  <SkipForward size={16} fill="currentColor" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
