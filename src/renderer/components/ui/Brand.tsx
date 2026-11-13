import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import mascotUrl from "@/assets/logo-mark.svg";

/**
 * A capivara com a laranja (pixel art da marca, gerada por site/pixel/pixel.mjs).
 * A largura é múltipla de 29 px (a arte tem 29×23 pixels) para não borrar.
 */
export function Mascot({ scale = 3, bob = true, className }: { scale?: number; bob?: boolean; className?: string }) {
  return (
    <img
      src={mascotUrl}
      alt=""
      aria-hidden
      draggable={false}
      width={29 * scale}
      height={23 * scale}
      className={cn("select-none [image-rendering:pixelated]", bob && "animate-bob", className)}
    />
  );
}

// Matriz de Bayer 8×8 (a mesma do site): limiar de cada pixel no pontilhado ordenado.
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9,
  41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

function accentRgb(): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().split(/\s+/).map(Number);
  return raw.length === 3 && raw.every((n) => Number.isFinite(n)) ? [raw[0], raw[1], raw[2]] : [255, 154, 60];
}

/**
 * Brilho pontilhado em 1 bit (Bayer 8×8), na cor de destaque do tema.
 * É a mesma linguagem visual do site: uma luz feita de pixels, sem degradê.
 * Desenhado uma vez em canvas pequeno e ampliado sem suavização; redesenha ao trocar de tema.
 */
export function DitherGlow({ className, cell = 3, strength = 0.55 }: { className?: string; cell?: number; strength?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const box = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(box.width / cell));
      const h = Math.max(1, Math.round(box.height / cell));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const [r, g, b] = accentRgb();
      const img = ctx.createImageData(w, h);
      // Luz elíptica vinda do canto superior direito, caindo até zero.
      const cx = w * 0.78;
      const cy = -h * 0.15;
      const rx = w * 0.62;
      const ry = h * 1.25;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
          const intensity = Math.max(0, 1 - d) ** 1.6 * strength;
          if (intensity * 64 > BAYER8[(y % 8) * 8 + (x % 8)]) {
            const i = (y * w + x) * 4;
            img.data[i] = r;
            img.data[i + 1] = g;
            img.data[i + 2] = b;
            img.data[i + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(canvas);
    // Trocar de tema muda o --accent: o tema fica em atributos/classes do <html>.
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => {
      resize.disconnect();
      theme.disconnect();
    };
  }, [cell, strength]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none [image-rendering:pixelated]", className)} />;
}
