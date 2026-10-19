import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSettingsStore } from "@/stores/useSettingsStore";
// Só a capivara com a laranja, sem o quadrado de fundo do ícone (site/pixel/pixel.mjs).
import markUrl from "@/assets/logo-mark.svg";
import { tr } from "@/lib/i18n";

/** Espelho da preferência no localStorage: decide antes das configurações carregarem. */
const SPLASH_KEY = "qrz.splash";
/** Tempo mínimo em tela para a animação terminar (a saída vem depois). */
const MIN_MS = 2600;
const NAME = "Qyrex";

function storedEnabled(): boolean {
  try {
    return localStorage.getItem(SPLASH_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Animação de abertura: a capivara cai e "pousa" (sombra e leve achatamento),
 * com brilho laranja e vapor em pixels; o nome sobe letra a letra por uma
 * máscara e a barrinha acompanha o carregamento real. A tela se dissolve no
 * app quando as configurações carregam.
 * Desligável em Configurações → Aparência (a preferência manda, não o "reduzir
 * movimento" do Windows, que otimizadores costumam ligar).
 */
export function SplashScreen() {
  const settings = useSettingsStore((s) => s.settings);
  const [enabled] = useState(storedEnabled);
  const [started, setStarted] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);

  // O relógio e as animações só começam no primeiro quadro desenhado de verdade
  // (a janela nasce escondida e aparece no ready-to-show): se algo atrasar a
  // janela, a animação não "corre" por trás e aparece inteira.
  useEffect(() => {
    let timer = 0;
    const raf = requestAnimationFrame(() => {
      setStarted(true);
      timer = window.setTimeout(() => setMinElapsed(true), MIN_MS);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  const pref = settings?.splashAnimation;
  useEffect(() => {
    if (pref === undefined) return;
    try {
      localStorage.setItem(SPLASH_KEY, pref ? "1" : "0");
    } catch {
      // sem storage: a animação só não respeita a preferência antes de carregar
    }
  }, [pref]);

  const visible = enabled && !(minElapsed && settings) && pref !== false;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          className="drag-region fixed inset-0 z-[200] flex items-center justify-center bg-bg"
          // Saída: um círculo se abre a partir do símbolo e revela o app inteiro.
          style={{
            maskImage: "radial-gradient(circle at 50% 50%, transparent var(--hole), #000 calc(var(--hole) + 1px))",
            WebkitMaskImage: "radial-gradient(circle at 50% 50%, transparent var(--hole), #000 calc(var(--hole) + 1px))",
          }}
          initial={{ "--hole": "0vmax" }}
          animate={{ "--hole": "0vmax" }}
          exit={{ "--hole": "80vmax", transition: { delay: 0.2, duration: 0.7, ease: [0.65, 0, 0.35, 1] } }}
          aria-hidden
          data-splash
        >
          {started && <SplashContent ready={settings !== null} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Pixels de vapor (o onsen do site): sobem atrás da capivara e somem. */
const STEAM = [
  { x: -22, delay: 0.9, size: 4 },
  { x: -8, delay: 1.5, size: 3 },
  { x: 10, delay: 1.15, size: 4 },
  { x: 24, delay: 1.8, size: 3 },
];

function SplashContent({ ready }: { ready: boolean }) {
  return (
    <motion.div
      className="relative flex flex-col items-center"
      exit={{ opacity: 0, scale: 1.12, transition: { duration: 0.4, ease: "easeIn" } }}
    >
      {/* Brilho laranja da marca que acende atrás da capivara. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-8 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgb(255_154_60/0.28),transparent_65%)] blur-xl"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.75], scale: [0.6, 1.1, 1] }}
        transition={{ duration: 1.6, ease: "easeOut", times: [0, 0.55, 1] }}
      />

      <div className="relative h-[69px] w-[87px]">
        {STEAM.map((p, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute bottom-full left-1/2 bg-text/35"
            style={{ width: p.size, height: p.size, marginLeft: p.x }}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [0, 0.7, 0], y: -30 }}
            transition={{ delay: p.delay, duration: 1.8, repeat: Infinity, repeatDelay: 0.6, ease: "easeOut" }}
          />
        ))}
        <motion.img
          src={markUrl}
          alt=""
          draggable={false}
          // 29×23 px desenhados em 3× (escala inteira: o pixel art não borra).
          className="relative h-[69px] w-[87px] [image-rendering:pixelated] drop-shadow-[0_10px_28px_rgb(255_154_60/0.35)]"
          initial={{ opacity: 0, y: -28 }}
          animate={{ opacity: 1, y: [-28, 0, -4, 0], scaleY: [1, 0.9, 1.03, 1], scaleX: [1, 1.08, 0.98, 1] }}
          transition={{ duration: 1.1, times: [0, 0.45, 0.7, 1], ease: "easeOut", opacity: { duration: 0.3 } }}
          style={{ originY: 1 }}
        />
        {/* Sombra que encolhe e cresce com a queda: dá a sensação de pouso. */}
        <motion.span
          aria-hidden
          className="absolute -bottom-1 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-[50%] bg-black/35 blur-[3px]"
          initial={{ opacity: 0, scaleX: 0.3 }}
          animate={{ opacity: [0, 0.9, 0.6, 0.7], scaleX: [0.3, 1.1, 0.85, 1] }}
          transition={{ duration: 1.1, times: [0, 0.45, 0.7, 1], ease: "easeOut" }}
        />
      </div>

      {/* Nome: cada letra sobe de dentro de uma "fresta" (máscara), em sequência. */}
      <div className="mt-4 flex overflow-hidden text-[22px] font-semibold leading-tight tracking-tight text-text">
        {NAME.split("").map((letter, i) => (
          <motion.span
            key={i}
            initial={{ y: "110%" }}
            animate={{ y: "0%" }}
            transition={{ delay: 0.75 + i * 0.07, type: "spring", stiffness: 260, damping: 24 }}
          >
            {letter}
          </motion.span>
        ))}
      </div>
      <motion.p
        className="mt-0.5 text-[11px] tracking-wide text-text-faint"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.3, duration: 0.5 }}
      >
        {tr("Seu espaço de trabalho de dev")}
      </motion.p>

      {/* Barrinha ligada ao carregamento real: anda até ~85% e só completa quando o app está pronto. */}
      <motion.div
        className="mt-4 h-[3px] w-24 overflow-hidden rounded-full bg-bg-hover"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.3 }}
      >
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent to-[#ff9a3c]"
          initial={{ width: "0%" }}
          animate={{ width: ready ? "100%" : "85%" }}
          transition={ready ? { duration: 0.5, ease: "easeOut" } : { delay: 1.2, duration: 1.6, ease: [0.65, 0, 0.35, 1] }}
        />
      </motion.div>
    </motion.div>
  );
}
