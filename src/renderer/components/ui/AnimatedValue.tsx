import { AnimatePresence, motion } from "motion/react";

/**
 * Valor que "rola" quando muda: cada caractere que troca sobe com blur,
 * como um contador mecânico. Serve para números já formatados (R$, US$, %).
 */
export function AnimatedValue({ value }: { value: string | number }) {
  const chars = String(value).split("");
  return (
    <span className="inline-flex overflow-hidden" aria-label={String(value)}>
      {chars.map((ch, i) => (
        // A chave inclui a posição contando do fim: dígitos à direita mudam sem mexer nos da esquerda.
        <span key={chars.length - i} className="relative inline-block" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch}
              className="inline-block whitespace-pre"
              initial={{ y: "60%", opacity: 0, filter: "blur(4px)" }}
              animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-60%", opacity: 0, filter: "blur(4px)" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
