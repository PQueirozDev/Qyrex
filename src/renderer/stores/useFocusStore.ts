import { create } from "zustand";
import type { FocusState } from "@shared/types";
import { attempt } from "@/lib/api";

type StartInput = Parameters<typeof window.workspace.focus.start>[0];

interface FocusStore {
  state: FocusState;
  /** Quando `state` foi lido (para o relógio local andar sem perguntar ao main a cada segundo). */
  readAt: number;
  loaded: boolean;
  /** Diálogo de iniciar/histórico aberto pelo cabeçalho, Início ou paleta. */
  dialog: "start" | "history" | null;
  init: () => () => void;
  setDialog: (dialog: "start" | "history" | null) => void;
  start: (input: StartInput) => Promise<boolean>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  finish: () => Promise<void>;
  cancel: () => Promise<void>;
}

const EMPTY: FocusState = { session: null, elapsedSeconds: 0 };

export const useFocusStore = create<FocusStore>((set) => {
  const apply = (state: FocusState | undefined) => {
    if (state) set({ state, readAt: Date.now(), loaded: true });
  };
  return {
    state: EMPTY,
    readAt: Date.now(),
    loaded: false,
    dialog: null,
    init: () => {
      void attempt(window.workspace.focus.state()).then(apply);
      // O main avisa quando a sessão muda, inclusive quando termina sozinha.
      return window.workspace.focus.onChange((state) => apply(state));
    },
    setDialog: (dialog) => set({ dialog }),
    start: async (input) => {
      const state = await attempt(window.workspace.focus.start(input));
      apply(state);
      return Boolean(state);
    },
    pause: async () => apply(await attempt(window.workspace.focus.pause())),
    resume: async () => apply(await attempt(window.workspace.focus.resume())),
    finish: async () => apply(await attempt(window.workspace.focus.finish())),
    cancel: async () => apply(await attempt(window.workspace.focus.cancel())),
  };
});

/** Segundos focados agora (o relógio anda localmente enquanto a sessão roda). */
export function liveElapsed(state: FocusState, readAt: number, now = Date.now()): number {
  const s = state.session;
  if (!s) return 0;
  const extra = s.status === "running" ? (now - readAt) / 1000 : 0;
  return Math.min(s.plannedMinutes * 60, Math.floor(state.elapsedSeconds + extra));
}
