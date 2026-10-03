import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import logoUrl from "@/assets/logo.svg";

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
 * Animação de abertura: a capivara entra com mola, o nome sobe letra a letra e
 * a tela se dissolve (blur + fade) no app quando as configurações carregam.
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
          className="drag-region fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(10px)", scale: 1.04 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          aria-hidden
          data-splash
        >
          {started && <SplashContent />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SplashContent() {
  return (
    <>
      <motion.img
        src={logoUrl}
        alt=""
        draggable={false}
        className="h-20 w-20 [image-rendering:pixelated] drop-shadow-[0_8px_24px_rgb(255_154_60/0.35)]"
        initial={{ opacity: 0, scale: 0.7, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 12, mass: 1.2 }}
      />
      <div className="flex text-2xl font-semibold tracking-tight text-text">
        {NAME.split("").map((letter, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.6 + i * 0.12, type: "spring", stiffness: 160, damping: 18 }}
          >
            {letter}
          </motion.span>
        ))}
      </div>
      {/* Barrinha que enche enquanto o app carrega por trás. */}
      <motion.div
        className="h-[3px] w-24 overflow-hidden rounded-full bg-bg-hover"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.3 }}
      >
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ delay: 1.2, duration: 1.3, ease: [0.65, 0, 0.35, 1] }}
        />
      </motion.div>
    </>
  );
}
