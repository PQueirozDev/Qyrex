import { create } from "zustand";
import { tr } from "@/lib/i18n";

/**
 * Capivara assistente: humor (animação), fala do momento e preferências.
 * As preferências são deste PC (localStorage), como as outras escolhas visuais.
 */

export type Mood = "idle" | "walking" | "sleeping" | "waking" | "thinking" | "working" | "happy" | "celebrating" | "worried" | "error";
export type BuddyEvent =
  | { kind: "taskDone"; title: string }
  | { kind: "buildOk"; name: string }
  | { kind: "buildFail"; name: string }
  | { kind: "processFail"; name: string }
  | { kind: "focusStart"; minutes: number }
  | { kind: "focusEnd" }
  | { kind: "thinking" }
  | { kind: "answered" };

export interface BuddyPrefs {
  enabled: boolean;
  animations: boolean;
  /** all: reage a tudo e dá dicas; few: só o importante, com intervalo; silent: sem balões. */
  frequency: "all" | "few" | "silent";
  position: "bottom-right" | "bottom-left";
  sounds: boolean;
  /** auto: segue o "reduzir movimento" do Windows; on: sempre parado; off: sempre anima. */
  reducedMotion: "auto" | "on" | "off";
  /** Permite mandar perguntas livres à IA conectada (cada envio ainda pede confirmação na hora). */
  ai: boolean;
}

const PREFS_KEY = "qrz.buddy";
export const DEFAULT_BUDDY: BuddyPrefs = { enabled: true, animations: true, frequency: "few", position: "bottom-right", sounds: false, reducedMotion: "auto", ai: true };

function readPrefs(): BuddyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<BuddyPrefs>;
    return { ...DEFAULT_BUDDY, ...raw };
  } catch {
    return DEFAULT_BUDDY;
  }
}

/** Quanto tempo cada humor passageiro dura antes de voltar ao normal. */
const MOOD_MS: Partial<Record<Mood, number>> = { happy: 3500, celebrating: 4500, worried: 6000, error: 6000, waking: 1400, walking: 3000 };
/** Intervalo mínimo entre balões no modo "few" (falhas furam a fila). */
const FEW_COOLDOWN = 3 * 60_000;

interface BuddyState {
  prefs: BuddyPrefs;
  mood: Mood;
  message: string | null;
  lastMessageAt: number;
  setPrefs: (patch: Partial<BuddyPrefs>) => void;
  setMood: (mood: Mood) => void;
  say: (message: string, opts?: { important?: boolean; mood?: Mood }) => void;
  dismiss: () => void;
  react: (event: BuddyEvent) => void;
}

let moodTimer: number | null = null;
let messageTimer: number | null = null;

function chirp(kind: "good" | "bad") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    const notes = kind === "good" ? [660, 880] : [330, 247];
    osc.frequency.setValueAtTime(notes[0], ctx.currentTime);
    osc.frequency.setValueAtTime(notes[1], ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    osc.onended = () => void ctx.close();
  } catch {
    // sem áudio: segue em silêncio
  }
}

export const useBuddyStore = create<BuddyState>((set, get) => ({
  prefs: readPrefs(),
  mood: "idle",
  message: null,
  lastMessageAt: 0,

  setPrefs: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // sem storage: vale só nesta sessão
    }
    set({ prefs });
  },

  setMood: (mood) => {
    if (moodTimer) window.clearTimeout(moodTimer);
    set({ mood });
    const ms = MOOD_MS[mood];
    if (ms) moodTimer = window.setTimeout(() => set({ mood: mood === "waking" ? "idle" : "idle" }), ms);
  },

  say: (message, opts) => {
    const { prefs, lastMessageAt } = get();
    if (opts?.mood) get().setMood(opts.mood);
    if (!prefs.enabled || prefs.frequency === "silent") return;
    if (prefs.frequency === "few" && !opts?.important && Date.now() - lastMessageAt < FEW_COOLDOWN) return;
    if (messageTimer) window.clearTimeout(messageTimer);
    set({ message, lastMessageAt: Date.now() });
    messageTimer = window.setTimeout(() => set({ message: null }), 7000);
  },

  dismiss: () => set({ message: null }),

  react: (event) => {
    const { say, prefs } = get();
    if (!prefs.enabled) return;
    switch (event.kind) {
      case "taskDone":
        say(tr("Boa! \"{title}\" concluída.", { title: event.title }), { mood: "happy" });
        if (prefs.sounds) chirp("good");
        break;
      case "buildOk":
        say(tr("{name} passou. Pode seguir!", { name: event.name }), { mood: "celebrating" });
        if (prefs.sounds) chirp("good");
        break;
      case "buildFail":
        say(tr("{name} falhou. Quer ver a saída?", { name: event.name }), { mood: "worried", important: true });
        if (prefs.sounds) chirp("bad");
        break;
      case "processFail":
        say(tr("O processo {name} parou com erro.", { name: event.name }), { mood: "error", important: true });
        if (prefs.sounds) chirp("bad");
        break;
      case "focusStart":
        say(tr("Foco de {n} min. Eu cuido do silêncio.", { n: event.minutes }), { mood: "working" });
        break;
      case "focusEnd":
        say(tr("Sessão de foco encerrada. Hora de esticar as patas."), { mood: "happy", important: true });
        break;
      case "thinking":
        get().setMood("thinking");
        break;
      case "answered":
        get().setMood("idle");
        break;
    }
  },
}));

/** Dicas reais de uso (só no modo "all", de vez em quando). */
export const BUDDY_TIPS = [
  () => tr("Dica: Ctrl+K abre a paleta de comandos de qualquer lugar."),
  () => tr("Dica: no Workspace, arraste uma aba para a borda de um painel para dividir."),
  () => tr("Dica: Ctrl+Shift+T cria uma tarefa rápida."),
  () => tr("Dica: o botão Daily no Início resume seus commits de ontem."),
  () => tr("Dica: a aba Portas, em Processos, libera a porta que ficou presa."),
  () => tr("Dica: a barra lateral recolhe no botão ao lado do logo."),
];
