// Pixel art do Qyrex: a capivara, a cena do onsen noturno (vídeo do site),
// a folha de sprites do hero e o ícone do app. Tudo desenhado em código,
// pixel a pixel, sem imagens de terceiros.
//
// Uso (precisa do ffmpeg no PATH):
//   node site/pixel/pixel.mjs            # gera tudo
//   node site/pixel/pixel.mjs video      # só o vídeo
//   node site/pixel/pixel.mjs sprite     # só a folha de sprites
//   node site/pixel/pixel.mjs icon       # só o ícone (build/icon.svg)

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const ASSETS = path.join(ROOT, "site", "assets");

// --- Base ----------------------------------------------------------------------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const TAU = Math.PI * 2;
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663) ^ 0x5bd1e995) >>> 0) % 1000;

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  set(x, y, c, a = 1) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const rgb = typeof c === "string" ? hex(c) : c;
    const i = (y * this.w + x) * 4;
    if (a >= 1) {
      this.d[i] = rgb[0];
      this.d[i + 1] = rgb[1];
      this.d[i + 2] = rgb[2];
      this.d[i + 3] = 255;
      return;
    }
    if (a <= 0) return;
    const da = this.d[i + 3] / 255;
    const oa = a + da * (1 - a);
    for (let k = 0; k < 3; k++) this.d[i + k] = (rgb[k] * a + this.d[i + k] * da * (1 - a)) / oa;
    this.d[i + 3] = oa * 255;
  }
  get(x, y) {
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  rect(x0, y0, w, h, c, a = 1) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a);
  }
  /** Copia outro canvas (só pixels opacos), com recorte opcional por função. */
  blit(src, ox, oy, clip = null) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const [r, g, b, a] = src.get(x, y);
        if (!a) continue;
        if (clip && !clip(x + ox, y + oy)) continue;
        this.set(x + ox, y + oy, [r, g, b], a / 255);
      }
  }
}

const inE = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
function inRR(x, y, x0, y0, x1, y1, r) {
  const px = x + 0.5;
  const py = y + 0.5;
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

// --- A capivara ----------------------------------------------------------------

export const PAL = {
  outline: "#2a170c",
  furD: "#6b4122",
  furM: "#8c5a31",
  furB: "#a86f3e",
  furL: "#c48a52",
  furH: "#dfaa6c",
  nose: "#3a2114",
  eye: "#120a06",
  shine: "#fff7e8",
  orange: "#f28a1e",
  orangeD: "#c65f15",
  orangeH: "#ffc767",
  leaf: "#5dbb4c",
  leafD: "#2f7a33",
};

const CAPY_W = 60;
const CAPY_H = 44;

/**
 * Capivara sentada, de perfil, olhando para a direita, com a laranja na cabeça.
 * `blink` fecha o olho, `ear` mexe a orelha, `bob` sobe a cabeça 1 px,
 * `breathe` (0..1) enche o corpo.
 */
export function capybara({ blink = false, ear = false, bob = 0, breathe = 0, orange = true } = {}) {
  const W = CAPY_W;
  const H = CAPY_H;
  const OY = 4; // espaço para a laranja e a folha
  const hy = OY - bob;
  const EMPTY = 0,
    BODY = 1,
    HEAD = 2,
    EAR = 3,
    LEG = 4,
    ORANGE = 5,
    LEAF = 6;
  const reg = new Uint8Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? EMPTY : reg[y * W + x]);

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (inE(x, y, 25, 25 + OY - breathe * 0.6, 18, 11.5 + breathe * 0.6) || inE(x, y, 15, 26 + OY, 10.5, 10.5)) reg[i] = BODY;
      if (!reg[i] && (inRR(x, y, 35, 30 + OY, 40, 37.6 + OY, 1.2) || inRR(x, y, 14, 33 + OY, 22, 37.6 + OY, 1.5))) reg[i] = LEG;
      const ex = ear ? 35.5 : 36;
      const ey = ear ? 5.8 : 6.8;
      if (!reg[i] && inE(x, y, ex, ey + hy, 2.7, 2.5)) reg[i] = EAR;
      if (inE(x, y, 41, 16 + hy, 10, 8.5) || inRR(x, y, 44, 11 + hy, 55.5, 24.4 + hy, 5)) reg[i] = HEAD;
      if (orange && inE(x, y, 42.5, 3.4 + hy, 3.5, 3.4)) reg[i] = ORANGE;
    }
  if (orange) {
    for (const [x, y] of [
      [43, -1],
      [44, -1],
      [45, -2],
      [44, -2],
    ])
      if (y + hy >= 0) reg[(y + hy) * W + x] = LEAF;
  }

  const c = new Canvas(W, H);
  const fur = (x, y, r) => {
    const up = at(x, y - 1),
      up2 = at(x, y - 2),
      dn = at(x, y + 1),
      dn2 = at(x, y + 2),
      lf = at(x - 1, y),
      rt = at(x + 1, y);
    const outside = (v) => v === EMPTY || v === ORANGE || v === LEAF;
    // Vinco entre cabeça e corpo.
    if (r === BODY && up === HEAD) return PAL.furD;
    if (r === BODY && (rt === HEAD || at(x + 1, y - 1) === HEAD)) return PAL.furM;
    if (r === EAR) return inE(x, y, ear ? 36 : 36.5, (ear ? 6.3 : 7.3) + hy, 1.2, 1.3) ? PAL.nose : PAL.furM;
    if (r === LEG) return dn === EMPTY ? PAL.furD : PAL.furM;
    if (outside(up)) return PAL.furH;
    if (outside(up2)) return PAL.furL;
    if (outside(dn)) return PAL.furD;
    if (outside(dn2)) return PAL.furM;
    if (r === BODY && y > 32 + OY) return PAL.furM;
    if (r === HEAD && x >= 49 && y >= 19 + hy) return PAL.furM; // focinho por baixo
    if (outside(lf)) return PAL.furL;
    if (outside(rt)) return PAL.furM;
    if (hash(x, y) % 13 === 0) return PAL.furM; // textura do pelo
    if (r === BODY && y < 20 + OY && hash(x + 3, y) % 7 === 0) return PAL.furL;
    return PAL.furB;
  };

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = at(x, y);
      if (r === EMPTY) {
        const n = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
        if (n.some((v) => v !== EMPTY)) c.set(x, y, PAL.outline);
        continue;
      }
      if (r === ORANGE) {
        const hl = inE(x, y, 41.5, 2.3 + hy, 1.4, 1.2);
        const dk = !inE(x, y, 42, 2.9 + hy, 3.3, 3.2);
        c.set(x, y, hl ? PAL.orangeH : dk ? PAL.orangeD : PAL.orange);
        continue;
      }
      if (r === LEAF) {
        c.set(x, y, x === 43 ? PAL.leafD : PAL.leaf);
        continue;
      }
      c.set(x, y, fur(x, y, r));
    }

  // Olho, narina e boca.
  const eY = 13 + hy;
  if (blink) {
    c.set(44, eY + 1, PAL.outline);
    c.set(45, eY + 1, PAL.outline);
  } else {
    c.set(44, eY, PAL.shine);
    c.set(45, eY, PAL.eye);
    c.set(44, eY + 1, PAL.eye);
    c.set(45, eY + 1, PAL.eye);
  }
  c.set(53, 14 + hy, PAL.nose);
  c.set(54, 14 + hy, PAL.nose);
  c.set(54, 15 + hy, PAL.nose);
  for (let x = 51; x <= 54; x++) c.set(x, 21 + hy, PAL.nose);
  c.set(55, 20 + hy, PAL.nose);
  // Bochecha sutil.
  c.set(47, 18 + hy, PAL.furL);
  c.set(48, 18 + hy, PAL.furL);
  return c;
}

// --- Cena: onsen noturno (vídeo) -----------------------------------------------

const SW = 320;
const SH = 180;
const FRAMES = 96; // 8 s a 12 fps; todo movimento repete a cada 96 quadros
const WATER_Y = 146;

const R = rng(20260929);
const STARS = Array.from({ length: 90 }, () => ({ x: Math.floor(R() * SW), y: Math.floor(R() * 95), k: 1 + Math.floor(R() * 3), p: R() * TAU, big: R() < 0.12 }));
const FAR = Array.from({ length: SW }, (_, x) => 100 - 10 * Math.sin(x / 37 + 1.3) - 6 * Math.sin(x / 13 + 0.4) - 3 * Math.sin(x / 5.3));
const NEAR = Array.from({ length: SW }, (_, x) => 114 - 7 * Math.sin(x / 29 + 3.1) - 3 * Math.sin(x / 9 + 2));
const TREES = Array.from({ length: 34 }, (_, i) => ({ x: Math.floor(i * 9.7 + R() * 6), h: 8 + Math.floor(R() * 10) }));
const STEAM = Array.from({ length: 46 }, (_, i) => ({ x: 20 + R() * 280, p: Math.floor(R() * FRAMES), s: 0.6 + R() * 0.9, w: R() * TAU, big: R() < 0.4, i }));
const FLIES = Array.from({ length: 9 }, () => ({ x: 20 + R() * 280, y: 60 + R() * 70, ax: 6 + R() * 14, ay: 4 + R() * 8, fx: 1 + Math.floor(R() * 2), fy: 1 + Math.floor(R() * 3), p: R() * TAU }));
const ROCKS = (() => {
  const out = [];
  const r2 = rng(7);
  for (let x = -6; x < SW + 10; x += 9 + Math.floor(r2() * 7)) {
    const t = (x - 160) / 190;
    const top = 175 - 45 * Math.sqrt(Math.max(0, 1 - t * t));
    out.push({ x, y: top - 1 + r2() * 3, rx: 6 + r2() * 6, ry: 3.5 + r2() * 2.5 });
  }
  return out;
})();

const SKY = ["#070914", "#0a0d1e", "#0d1228", "#111834", "#161f40", "#1b274b", "#223157"].map(hex);
const WATER_TOP = hex("#215d6a");
const WATER_BOT = hex("#0f2e3a");

// Código que "aparece" na tela do notebook: [recuo, [comprimento, cor], ...]
const CODE = [
  [0, [3, "#ff9a3c"], [5, "#e8e6df"]],
  [1, [2, "#7fd4d8"], [6, "#e8e6df"], [2, "#b7f171"]],
  [2, [4, "#c792ea"], [3, "#e8e6df"]],
  [2, [5, "#b7f171"]],
  [1, [1, "#e8e6df"]],
  [0, [2, "#ff9a3c"], [4, "#7fd4d8"], [2, "#e8e6df"]],
  [1, [6, "#e8e6df"], [3, "#b7f171"]],
];

function inPool(x, y) {
  const t = (x + 0.5 - 160) / 190;
  return y + 0.5 >= 175 - 45 * Math.sqrt(Math.max(0, 1 - t * t));
}

function drawScene(f) {
  const c = new Canvas(SW, SH);
  const ph = (f / FRAMES) * TAU;

  // Céu em faixas com dithering.
  for (let y = 0; y < 125; y++) {
    const t = Math.min(0.999, y / 120) * (SKY.length - 1);
    const i = Math.floor(t);
    const fr = t - i;
    for (let x = 0; x < SW; x++) {
      const useNext = fr > 0.66 || (fr > 0.33 && (x + y) % 2 === 0);
      c.set(x, y, SKY[Math.min(SKY.length - 1, useNext ? i + 1 : i)]);
    }
  }
  // Estrelas piscando.
  for (const s of STARS) {
    const b = 0.5 + 0.5 * Math.sin(ph * s.k + s.p);
    const col = mix(hex("#3d4a7a"), hex("#fff6d8"), b);
    c.set(s.x, s.y, col);
    if (s.big && b > 0.75) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(s.x + dx, s.y + dy, col, 0.45);
    }
  }
  // Estrela cadente uma vez por loop.
  if (f >= 58 && f < 66) {
    const t = (f - 58) / 8;
    const hx = 40 + t * 90;
    const hyy = 18 + t * 26;
    for (let k = 0; k < 12; k++) c.set(hx - k * 1.8, hyy - k * 0.52, "#fff6d8", (1 - k / 12) * (1 - t * 0.5));
  }
  // Lua com halo.
  const MX = 250,
    MY = 54;
  for (let y = MY - 24; y <= MY + 24; y++)
    for (let x = MX - 24; x <= MX + 24; x++) {
      const d = Math.hypot(x + 0.5 - MX, y + 0.5 - MY);
      if (d <= 12.5) {
        const crater = inE(x, y, MX - 4, MY - 2, 2.6, 2.2) || inE(x, y, MX + 4, MY + 4, 3.2, 2.6) || inE(x, y, MX + 3, MY - 6, 1.6, 1.4);
        const shade = x - MX + (y - MY) > 12;
        c.set(x, y, crater ? "#d9c89d" : shade ? "#e6d6ad" : "#f6ecc9");
      } else if (d <= 13.5) c.set(x, y, "#fff9e0", 0.35);
      else if (d <= 22 && (x + y) % 2 === 0) c.set(x, y, "#3b4a82", 0.35 * (1 - (d - 13) / 9));
    }

  // Montanhas e pinheiros.
  for (let x = 0; x < SW; x++) {
    for (let y = Math.floor(FAR[x]); y < 125; y++) c.set(x, y, y === Math.floor(FAR[x]) ? "#26305a" : "#1b2246");
    for (let y = Math.floor(NEAR[x]); y < 125; y++) c.set(x, y, y === Math.floor(NEAR[x]) ? "#1e2748" : "#141a36");
  }
  for (const t of TREES) {
    const base = 126;
    for (let k = 0; k < t.h; k++) {
      const half = Math.floor((k / t.h) * 4.5) + (k % 3 === 0 ? 1 : 0);
      for (let dx = -half; dx <= half; dx++) c.set(t.x + dx, base - t.h + k, "#0d1126");
    }
    c.set(t.x, base, "#0d1126");
  }
  // Chão atrás do onsen.
  for (let y = 124; y < SH; y++) for (let x = 0; x < SW; x++) c.set(x, y, (hash(x, y) % 17 === 0) ? "#1a2531" : "#121a24");

  // Água.
  const moonCol = hex("#f6ecc9");
  for (let y = 120; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      if (!inPool(x, y)) continue;
      const t = Math.max(0, (y - 130) / 50);
      let col = mix(WATER_TOP, WATER_BOT, t);
      // Ondinhas horizontais que correm devagar.
      const wave = Math.sin(x / 7 + ph * 2 + y * 1.7) + Math.sin(x / 3.1 - ph * 3 + y);
      if (wave > 1.55) col = mix(col, hex("#58a7b0"), 0.55);
      else if (wave < -1.7) col = mix(col, hex("#0b2530"), 0.5);
      // Reflexo da lua tremulando.
      const spread = 5 + (y - 130) * 0.18 + 2 * Math.sin(y * 0.9 + ph * 4);
      if (Math.abs(x - MX) < spread && (y + Math.floor(f / 2)) % 3 !== 0) col = mix(col, moonCol, 0.55 - Math.abs(x - MX) / (spread * 2.2));
      c.set(x, y, col);
    }
  // Brilho na borda de cima da água.
  for (let x = 0; x < SW; x++)
    for (let y = 120; y < SH; y++)
      if (inPool(x, y)) {
        c.set(x, y, "#7fd4d8", 0.5);
        break;
      }

  // Pedras de trás.
  for (const r of ROCKS) {
    for (let y = Math.floor(r.y - r.ry - 1); y <= r.y + r.ry + 1; y++)
      for (let x = Math.floor(r.x - r.rx - 1); x <= r.x + r.rx + 1; x++) {
        if (inE(x, y, r.x, r.y, r.rx, r.ry)) {
          const top = !inE(x, y - 2, r.x, r.y, r.rx, r.ry);
          const bot = !inE(x, y + 2, r.x, r.y, r.rx, r.ry);
          c.set(x, y, top ? "#5d6583" : bot ? "#2b3046" : hash(x, y) % 11 === 0 ? "#454c68" : "#3b4159");
        } else if (inE(x, y, r.x, r.y, r.rx + 1, r.ry + 1)) c.set(x, y, "#1c2031");
      }
  }

  // Capivara boiando (corta na linha d'água).
  const bob = Math.sin(ph * 2) > 0.3 ? 1 : 0;
  const blink = (f >= 30 && f <= 32) || (f >= 71 && f <= 72);
  const ear = f >= 48 && f <= 53 && f % 2 === 0;
  const capy = capybara({ blink, ear, bob: 0, breathe: 0.5 + 0.5 * Math.sin(ph * 2) });
  const CX = 92,
    CY = 115 + bob;
  c.blit(capy, CX, CY, (x, y) => y < WATER_Y);
  // Corpo submerso levemente visível.
  for (let y = WATER_Y; y < WATER_Y + 7; y++)
    for (let x = CX + 5; x < CX + 44; x++) {
      const [, , , a] = capy.get(x - CX, y - CY) ?? [0, 0, 0, 0];
      if (a && y - CY < CAPY_H) c.set(x, y, "#3e3a2c", 0.35 * (1 - (y - WATER_Y) / 7));
    }

  // Bandeja de madeira com o notebook, boiando.
  const tb = Math.sin(ph * 2 + 1.2) > 0 ? 1 : 0;
  const TX = 168,
    TY = WATER_Y - 3 + tb;
  for (let x = TX; x < TX + 46; x++) {
    c.set(x, TY - 1, "#3f240f");
    c.set(x, TY, x % 11 === 0 ? "#7a4a22" : "#b27a40");
    c.set(x, TY + 1, "#8b5a2b");
    c.set(x, TY + 2, "#5b3717", 0.9);
  }
  c.set(TX - 1, TY, "#3f240f");
  c.set(TX + 46, TY, "#3f240f");
  // Notebook.
  const LX = TX + 9,
    LY = TY - 22;
  c.rect(LX - 1, LY - 1, 29, 21, "#171a24");
  c.rect(LX, LY, 27, 19, "#2c3142");
  c.rect(LX + 2, LY + 2, 23, 15, "#0b1719");
  c.rect(LX - 3, LY + 19, 33, 2, "#8a90a6");
  c.rect(LX - 3, LY + 20, 33, 1, "#555b70");
  c.set(LX + 13, LY + 1, "#4b5268");
  // Código sendo digitado.
  const total = CODE.reduce((n, line) => n + line.slice(1).reduce((m, [len]) => m + len + 1, 0), 0);
  const shown = Math.min(total, Math.floor((f / 78) * total));
  let budget = shown;
  let cursor = null;
  CODE.forEach((line, row) => {
    let x = LX + 3 + line[0] * 2;
    const y = LY + 3 + row * 2;
    for (const [len, col] of line.slice(1)) {
      for (let k = 0; k < len; k++) {
        if (budget <= 0) break;
        c.set(x, y, col);
        x++;
        budget--;
      }
      if (budget > 0) {
        x++;
        budget--;
      }
    }
    if (budget <= 0 && !cursor) cursor = [x, y];
  });
  if (!cursor) cursor = [LX + 3, LY + 3 + CODE.length * 2];
  if (Math.floor(f / 3) % 2 === 0) c.set(cursor[0], cursor[1], "#ff9a3c");

  // Luz da tela no rosto da capivara e na água.
  const gx = LX + 13,
    gy = LY + 9;
  for (let y = gy - 30; y < gy + 30; y++)
    for (let x = gx - 40; x < gx + 26; x++) {
      if (x >= LX - 1 && x < LX + 28 && y >= LY - 1 && y < LY + 21) continue;
      const d = Math.hypot((x - gx) * 0.8, y - gy);
      if (d < 30) c.set(x, y, "#69e3cf", 0.13 * (1 - d / 30));
    }

  // Anéis na água em volta da capivara e da bandeja.
  const ring = (cx, cy, t, rmax) => {
    const r = 4 + t * rmax;
    const a = 0.55 * (1 - t);
    for (let k = 0; k < 90; k++) {
      const ang = (k / 90) * TAU;
      c.set(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.28, "#9fe3e6", a);
    }
  };
  ring(CX + 30, WATER_Y + 1, (f % 48) / 48, 26);
  ring(CX + 30, WATER_Y + 1, ((f + 24) % 48) / 48, 26);
  ring(TX + 23, TY + 3, ((f + 12) % 48) / 48, 22);
  // Linha d'água clara no corpo.
  for (let x = CX + 4; x < CX + 46; x++) if (capy.get(Math.min(CAPY_W - 1, x - CX), Math.min(CAPY_H - 1, WATER_Y - CY))[3]) c.set(x, WATER_Y, "#b8f0ef", 0.8);

  // Pedras da frente (cantos).
  const frontRock = (cx, cy, rx, ry) => {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        if (inE(x, y, cx, cy, rx, ry)) {
          const top = !inE(x, y - 2, cx, cy, rx, ry);
          c.set(x, y, top ? "#4c5472" : hash(x, y) % 9 === 0 ? "#2f3550" : "#262b40");
        } else if (inE(x, y, cx, cy, rx + 1, ry + 1)) c.set(x, y, "#12141f");
      }
  };
  frontRock(8, 178, 26, 12);
  frontRock(36, 182, 14, 7);
  frontRock(308, 176, 28, 14);
  frontRock(278, 183, 14, 6);
  // Mato na frente.
  for (const bx of [22, 30, 290, 300, 312]) for (let k = 0; k < 7; k++) c.set(bx + Math.round(Math.sin(ph + bx + k * 0.3) * (k / 7) * 1.4), 170 - k, k > 4 ? "#3e6b3a" : "#2a4a2c");

  // Vapor subindo.
  for (const s of STEAM) {
    const t = ((f + s.p) % FRAMES) / FRAMES;
    const baseY = inPool(s.x, WATER_Y) ? WATER_Y + (s.x > 150 && s.x < 230 ? 6 : 0) : 140;
    const y = baseY + 18 - t * 70 * s.s;
    const x = s.x + Math.sin(t * TAU * 2 + s.w) * 4;
    const a = Math.sin(Math.PI * t) * 0.16;
    if (y < 60) continue;
    c.set(x, y, "#dfe8f5", a);
    if (s.big) {
      c.set(x + 1, y, "#dfe8f5", a);
      c.set(x, y - 1, "#dfe8f5", a);
      c.set(x + 1, y - 1, "#dfe8f5", a * 0.7);
    }
  }

  // Vaga-lumes.
  for (const fl of FLIES) {
    const x = fl.x + Math.sin(ph * fl.fx + fl.p) * fl.ax;
    const y = fl.y + Math.sin(ph * fl.fy + fl.p * 1.7) * fl.ay;
    const on = 0.5 + 0.5 * Math.sin(ph * 3 + fl.p * 3);
    c.set(x, y, "#f3ff9a", 0.35 + on * 0.65);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + dx, y + dy, "#d7ff5a", 0.18 * on);
  }
  return c;
}

// --- Saídas --------------------------------------------------------------------

function ffmpeg(args, frames) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["pipe", "inherit", "inherit"] });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}`))));
    for (const fr of frames) p.stdin.write(Buffer.from(fr.buffer));
    p.stdin.end();
  });
}

async function renderVideo() {
  const frames = Array.from({ length: FRAMES }, (_, f) => drawScene(f).d);
  const input = ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${SW}x${SH}`, "-r", "12", "-i", "-"];
  // "Câmera": recorta 256×144 da cena (menos céu, capivara maior) e amplia 5× sem suavizar.
  const scale = ["-vf", "crop=256:144:32:36,scale=1280:720:flags=neighbor"];
  await ffmpeg([...input, ...scale, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-preset", "slow", "-tune", "animation", "-movflags", "+faststart", path.join(ASSETS, "qyrex-onsen.mp4")], frames);
  await ffmpeg([...input, ...scale, "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-crf", "22", "-b:v", "0", "-row-mt", "1", path.join(ASSETS, "qyrex-onsen.webm")], frames);
  await ffmpeg([...input, ...scale, "-frames:v", "1", path.join(ASSETS, "qyrex-onsen-poster.png")], [frames[20]]);
  // Capa para redes sociais (1200×630) a partir de um quadro da cena.
  await ffmpeg([...input, "-vf", `crop=256:144:32:36,scale=1280:720:flags=neighbor,crop=1200:630:40:60`, "-frames:v", "1", path.join(ASSETS, "og-cover.png")], [frames[20]]);
  console.log("vídeo: site/assets/qyrex-onsen.{mp4,webm} + poster");
}

/** Folha de sprites do hero: capivara inteira, fundo transparente. */
async function renderSprite() {
  const N = 24;
  const sheet = new Canvas(CAPY_W * N, CAPY_H);
  for (let f = 0; f < N; f++) {
    const ph = (f / N) * TAU;
    const capy = capybara({
      blink: f === 9 || f === 10,
      ear: f === 16 || f === 18,
      bob: Math.sin(ph) > 0.5 ? 1 : 0,
      breathe: 0.5 + 0.5 * Math.sin(ph),
    });
    sheet.blit(capy, f * CAPY_W, 0);
  }
  await ffmpeg(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${sheet.w}x${sheet.h}`, "-i", "-", "-frames:v", "1", path.join(ASSETS, "capy-sheet.png")], [sheet.d]);
  // Quadro único ampliado (favicon grande, README).
  const one = capybara({ breathe: 0.5 });
  await ffmpeg(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${CAPY_W}x${CAPY_H}`, "-i", "-", "-vf", `scale=${CAPY_W * 8}:${CAPY_H * 8}:flags=neighbor`, "-frames:v", "1", path.join(ASSETS, "capy.png")], [one.d]);
  fs.writeFileSync(path.join(ASSETS, "capy-sheet.json"), JSON.stringify({ frames: N, w: CAPY_W, h: CAPY_H, fps: 8 }));
  console.log(`sprite: site/assets/capy-sheet.png (${N} quadros de ${CAPY_W}×${CAPY_H})`);
}

/** Ícone 32×32: a capivara saindo da água do onsen, com a laranja. */
export function iconCanvas() {
  const S = 32;
  const c = new Canvas(S, S);
  const capy = capybara({ breathe: 0.5 });
  const WL = 25; // linha d'água do ícone
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const inside = inRR(x, y, 0, 0, 32, 32, 7);
      if (!inside) continue;
      if (y >= WL) c.set(x, y, y === WL ? "#8fe0e0" : y === WL + 1 ? "#3fa3a8" : "#236b77");
      else c.set(x, y, y < 12 ? "#141a33" : y < 19 ? "#18203d" : "#1c2647");
    }
  // Estrelas.
  for (const [x, y] of [[5, 5], [9, 11], [4, 17], [26, 22]]) c.set(x, y, "#f6ecc9");
  // Recorte da capivara: cabeça, laranja e ombro.
  const ox = -28,
    oy = 1;
  for (let y = 0; y < WL; y++)
    for (let x = 0; x < S; x++) {
      const sx = x - ox,
        sy = y - oy;
      if (sx < 0 || sy < 0 || sx >= CAPY_W || sy >= CAPY_H) continue;
      const [r, g, b, a] = capy.get(sx, sy);
      if (a && inRR(x, y, 0, 0, 32, 32, 7)) c.set(x, y, [r, g, b]);
    }
  // Ondinha na frente do corpo.
  for (const x of [3, 4, 5, 13, 14, 20, 21, 22]) c.set(x, WL + 3, "#5cc0c4");
  return c;
}

function renderIcon() {
  const c = iconCanvas();
  const rects = [];
  for (let y = 0; y < c.h; y++) {
    let x = 0;
    while (x < c.w) {
      const [r, g, b, a] = c.get(x, y);
      if (!a) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < c.w) {
        const n = c.get(x + run, y);
        if (n[0] !== r || n[1] !== g || n[2] !== b || n[3] !== a) break;
        run++;
      }
      const col = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
      rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${col}"/>`);
      x += run;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512" shape-rendering="crispEdges">\n<!-- Qyrex: capivara no onsen (pixel art 32×32, gerada por site/pixel/pixel.mjs) -->\n${rects.join("\n")}\n</svg>\n`;
  for (const out of [path.join(ROOT, "build", "icon.svg"), path.join(ROOT, "src", "renderer", "assets", "logo.svg"), path.join(ASSETS, "icon.svg")]) fs.writeFileSync(out, svg);
  console.log("ícone: build/icon.svg (+ logo da sidebar e do site)");
}

// --- CLI -----------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(ASSETS, { recursive: true });
  const what = process.argv[2] ?? "all";
  if (what === "all" || what === "icon") renderIcon();
  if (what === "all" || what === "sprite") await renderSprite();
  if (what === "all" || what === "video") await renderVideo();
}
