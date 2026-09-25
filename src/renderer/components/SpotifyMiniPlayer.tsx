import { useCallback, useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import type { SpotifyPlayback } from "@shared/types";
import { formatDuration } from "@/lib/format";
import { toast, useUIStore } from "@/stores/useUIStore";
import { cn } from "@/lib/cn";
import { tr } from "@/lib/i18n";

/**
 * Mini player do Spotify (Web API oficial). Só aparece quando a integração está
 * conectada E há algo tocando/pausado. Atualiza a cada 8s apenas com a janela
 * visível e online — sem polling em segundo plano.
 */
export function SpotifyMiniPlayer() {
  const online = useUIStore((s) => s.online);
  const [connected, setConnected] = useState(false);
  const [playback, setPlayback] = useState<SpotifyPlayback | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const volumeTimer = useRef<ReturnType<typeof setTimeout>>();

  const checkConnection = useCallback(async () => {
    const res = await window.workspace.integrations.list();
    setConnected(res.ok && res.data.some((i) => i.id === "spotify" && i.state === "connected"));
  }, []);

  const refresh = useCallback(async () => {
    const res = await window.workspace.spotify.playback();
    if (res.ok) {
      setPlayback(res.data);
      setProgress(res.data?.progressMs ?? 0);
    }
  }, []);

  useEffect(() => {
    void checkConnection();
    const onFocus = () => void checkConnection();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkConnection]);

  useEffect(() => {
    if (!connected || !online) {
      setPlayback(null);
      return;
    }
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 8000);
    return () => clearInterval(interval);
  }, [connected, online, refresh]);

  // Barra de progresso fluida entre as consultas.
  useEffect(() => {
    if (!playback?.isPlaying) return;
    const t = setInterval(() => setProgress((p) => Math.min(p + 1000, playback.durationMs)), 1000);
    return () => clearInterval(t);
  }, [playback]);

  async function control(action: "play" | "pause" | "next" | "previous") {
    setBusy(true);
    const res = await window.workspace.spotify.control(action);
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    setTimeout(() => void refresh(), 400);
  }

  function changeVolume(value: number) {
    setPlayback((p) => (p ? { ...p, volumePercent: value } : p));
    clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(async () => {
      const res = await window.workspace.spotify.volume(value);
      if (!res.ok) toast.error(res.error);
    }, 250);
  }

  if (!connected || !playback) {
    return (
      <div className="border-t border-border-subtle px-3 py-2.5">
        <button
          onClick={() => void window.workspace.system.openSpotifyApp()}
          className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-[11px] text-text-faint hover:text-text-muted"
        >
          <Music2 size={13} />
          {connected ? tr("Nada tocando no Spotify") : tr("Spotify")}
        </button>
      </div>
    );
  }

  const pct = playback.durationMs ? (progress / playback.durationMs) * 100 : 0;

  return (
    <div className="border-t border-border-subtle p-3">
      <div className="flex items-center gap-2.5">
        {playback.coverUrl ? (
          <img src={playback.coverUrl} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-hover">
            <Music2 size={14} className="text-text-faint" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-text" title={playback.track}>
            {playback.track}
          </p>
          <p className="truncate text-[11px] text-text-faint" title={`${playback.artists} — ${playback.album}`}>
            {playback.artists}
          </p>
        </div>
      </div>

      <div
        className="group mt-2 h-1 cursor-pointer rounded-full bg-border"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ms = ((e.clientX - rect.left) / rect.width) * playback.durationMs;
          setProgress(ms);
          void window.workspace.spotify.seek(ms).then((r) => !r.ok && toast.error(r.error));
        }}
      >
        <div className="h-full rounded-full bg-text-muted group-hover:bg-success" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-text-faint">
        <span>{formatDuration(progress)}</span>
        <span>{formatDuration(playback.durationMs)}</span>
      </div>

      <div className="mt-1 flex items-center justify-center gap-1">
        <button disabled={busy} onClick={() => void control("previous")} className="rounded-md p-1.5 text-text-muted hover:bg-bg-hover hover:text-text" aria-label={tr("Anterior")}>
          <SkipBack size={14} />
        </button>
        <button
          disabled={busy}
          onClick={() => void control(playback.isPlaying ? "pause" : "play")}
          className="rounded-full bg-text p-1.5 text-bg transition-transform hover:scale-105"
          aria-label={playback.isPlaying ? tr("Pausar") : tr("Tocar")}
        >
          {playback.isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button disabled={busy} onClick={() => void control("next")} className="rounded-md p-1.5 text-text-muted hover:bg-bg-hover hover:text-text" aria-label={tr("Próxima")}>
          <SkipForward size={14} />
        </button>
      </div>

      {playback.volumePercent !== null && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Volume2 size={12} className="text-text-faint" />
          <input
            type="range"
            min={0}
            max={100}
            value={playback.volumePercent}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className={cn("h-1 flex-1 accent-success")}
            aria-label={tr("Volume")}
          />
        </div>
      )}
    </div>
  );
}
