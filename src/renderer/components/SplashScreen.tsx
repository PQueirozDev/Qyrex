import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import logoUrl from "@/assets/logo.svg";

/** Espelho da preferência no localStorage: decide antes das configurações carregarem. */
const SPLASH_KEY = "qrz.splash";
/** Tempo mínimo em tela para a animação terminar (a saída vem depois). */
const MIN_MS = 1100;
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
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => window.clearTimeout(id);
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
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          aria-hidden
          data-splash
        >
          <motion.img
            src={logoUrl}
            alt=""
            draggable={false}
            className="h-20 w-20 [image-rendering:pixelated] drop-shadow-[0_8px_24px_rgb(255_154_60/0.35)]"
            initial={{ opacity: 0, scale: 0.8, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 16 }}
          />
          <div className="flex text-2xl font-semibold tracking-tight text-text">
            {NAME.split("").map((letter, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ delay: 0.22 + i * 0.05, type: "spring", stiffness: 320, damping: 22 }}
              >
                {letter}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
