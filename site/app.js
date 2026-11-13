// Qyrex — site. Sem dependências.

// Endereços num lugar só: trocar aqui se o repositório mudar de nome.
const LINKS = {
  repo: "https://github.com/PQueirozDev/Qyrex",
  // Os instaladores ficam em QrzSpace-releases: é o feed de atualização dos apps já instalados.
  releases: "https://github.com/PQueirozDev/QrzSpace-releases/releases",
  // Link direto do instalador: toda release publica uma cópia com nome fixo (scripts/release.mjs).
  download: "https://github.com/PQueirozDev/QrzSpace-releases/releases/latest/download/Qyrex-Setup.exe",
  latestApi: "https://api.github.com/repos/PQueirozDev/QrzSpace-releases/releases/latest",
};
LINKS.issues = `${LINKS.repo}/issues`;
LINKS.license = `${LINKS.repo}/blob/main/LICENSE`;
document.querySelectorAll("[data-link]").forEach((a) => {
  const href = LINKS[a.dataset.link];
  if (href) a.href = href;
});
document.querySelectorAll("[data-repo-url]").forEach((el) => (el.textContent = LINKS.repo));


const root = document.documentElement;
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
probe.canvas.width = probe.canvas.height = 1;
function rgbOf(name) {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#fff";
  probe.fillStyle = getComputedStyle(root).getPropertyValue(name).trim();
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Pontilhado suave por canal: preserva as cores, com passos pequenos entre tons. */
function ditherData(d, w, levels) {
  const n = levels - 1;
  for (let p = 0, i = 0; p < d.length; p += 4, i++) {
    const t = (BAYER[(((i / w) | 0) & 7) * 8 + ((i % w) & 7)] + 0.5) / 64;
    for (let k = 0; k < 3; k++) {
      const v = (d[p + k] / 255) * n;
      const b = Math.floor(v);
      d[p + k] = Math.round(((b + (v - b > t ? 1 : 0)) * 255) / n);
    }
    d[p + 3] = 255;
  }
}

function makeDither(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const box = canvas.parentElement;
  const st = { ctx, w: 0, h: 0, cell: 3, paint: () => {} };
  st.size = () => {
    const dpr = window.devicePixelRatio || 1;
    // Ponto de tamanho inteiro em pixels do monitor: senão o padrão cria listras.
    st.cell = Math.max(1, Math.round((box.clientWidth < 520 ? 2 : 3) * dpr)) / dpr;
    st.w = Math.max(8, Math.ceil(box.clientWidth / st.cell));
    st.h = Math.max(8, Math.ceil(box.clientHeight / st.cell));
    canvas.width = st.w;
    canvas.height = st.h;
    canvas.style.width = `${st.w * st.cell}px`;
    canvas.style.height = `${st.h * st.cell}px`;
    box.style.setProperty("--cell", `${st.cell}px`);
  };
  /** Desenha a fonte cobrindo a área (como object-fit: cover) e pontilha. */
  st.source = (src, sw, sh, focus) => {
    if (!sw || !sh || !st.w) return;
    const k = Math.max(st.w / sw, st.h / sh);
    const dw = sw * k;
    const dh = sh * k;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = getComputedStyle(root).getPropertyValue("--bg").trim();
    ctx.fillRect(0, 0, st.w, st.h);
    ctx.drawImage(src, (st.w - dw) * focus, (st.h - dh) * 0.5, dw, dh);
    const img = ctx.getImageData(0, 0, st.w, st.h);
    ditherData(img.data, st.w, 32);
    ctx.putImageData(img, 0, 0);
  };
  return st;
}

const dithers = [];
function repaintAll() {
  dithers.forEach((d) => d.paint());
}
function watchDither(st) {
  dithers.push(st);
  new ResizeObserver(() => {
    st.size();
    st.paint();
  }).observe(st.ctx.canvas.parentElement);
}

// Luz de pixels: reage ao ponteiro sem manter um loop de animação em repouso.
document.querySelectorAll('.hero-visual, .page-heading, .download-summary').forEach((host) => {
  host.classList.add('glow-host');
  const canvas = document.createElement('canvas');
  canvas.className = 'section-glow';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const cell = 3;
  const st = {
    ctx, w:0, h:0, pointer:null,
    size() {
      this.w = Math.max(1, Math.ceil(host.clientWidth / cell));
      this.h = Math.max(1, Math.ceil(Math.min(220, host.clientHeight) / cell));
      canvas.width = this.w; canvas.height = this.h;
      canvas.style.width = `${this.w * cell}px`; canvas.style.height = `${this.h * cell}px`;
    },
    paint() {
      if (!this.w || !this.h) return;
      const color = rgbOf('--accent');
      const img = ctx.createImageData(this.w, this.h);
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const distance = Math.hypot((x - this.w * .75) / (this.w * .7), (y + this.h * .1) / (this.h * 1.2));
          const nearby = this.pointer ? Math.exp(-((x / this.w - this.pointer.x) ** 2 + (y / this.h - this.pointer.y) ** 2) / .04) * .22 : 0;
          const intensity = Math.min(.65, Math.max(0, 1 - distance) ** 1.6 * .5 + nearby);
          if (intensity * 64 > BAYER[(y % 8) * 8 + x % 8]) {
            const p = (y * this.w + x) * 4;
            img.data[p] = color[0]; img.data[p + 1] = color[1]; img.data[p + 2] = color[2]; img.data[p + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  };
  watchDither(st);
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  const redraw = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; if (!document.hidden) st.paint(); });
  };
  host.addEventListener('pointermove', (event) => {
    if (motion.matches || !finePointer.matches || document.hidden) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    st.pointer = { x:(event.clientX - box.left) / box.width, y:(event.clientY - box.top) / box.height };
    redraw();
  }, { passive:true });
  const reset = () => { st.pointer = null; redraw(); };
  host.addEventListener('pointerleave', reset);
  motion.addEventListener('change', reset);
  finePointer.addEventListener('change', reset);
  document.addEventListener('visibilitychange', reset);
});

// Hero: o vídeo do onsen, quadro a quadro (12 fps, só enquanto aparece na tela).
{
  const canvas = document.querySelector('[data-dither="video"]');
  const video = document.querySelector(".dither-src");
  if (canvas && video) {
    const st = makeDither(canvas);
    const focus = Number(canvas.dataset.focus ?? 0.5);
    const poster = new Image();
    poster.src = video.poster;
    st.paint = () => {
      try {
        if (video.readyState >= 2) st.source(video, video.videoWidth, video.videoHeight, focus);
        else if (poster.complete) st.source(poster, poster.naturalWidth, poster.naturalHeight, focus);
      } catch {
        /* quadro indisponível: tenta no próximo */
      }
    };
    poster.addEventListener("load", st.paint);
    watchDither(st);
    let visible = false;
    let frame = 0;
    let last = 0;
    const tick = (t) => {
      if (t - last > 80) { last = t; st.paint(); }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (visible && !document.hidden && !motion.matches) {
        video.play().catch(() => {});
        frame = requestAnimationFrame(tick);
      } else { video.pause(); st.paint(); }
    };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(canvas.parentElement);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
  }
}

// Por dentro: o pôster do onsen, parado, atrás do print do app.
document.querySelectorAll('[data-dither="image"]').forEach((canvas) => {
  const st = makeDither(canvas);
  const img = new Image();
  const focus = Number(canvas.dataset.focus ?? 0.5);
  st.paint = () => img.complete && st.source(img, img.naturalWidth, img.naturalHeight, focus);
  img.addEventListener("load", st.paint);
  img.src = canvas.dataset.src;
  watchDither(st);
});

// Rodapé: paisagem desenhada em código (céu, lua, serras, campo e o onsen da capivara).
document.querySelectorAll('[data-dither="scene"]').forEach((canvas) => {
  const st = makeDither(canvas);
  const box = canvas.parentElement;
  const hash = (x, y) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return (n ^ (n >>> 16)) >>> 0;
  };
  st.paint = () => {
    const { w, h, ctx } = st;
    if (!w) return;
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const hz = Math.round(h * 0.6); // linha do horizonte
    const moonX = Math.round(w * 0.8);
    const moonY = Math.round(h * 0.2);
    const moonR = Math.max(5, Math.round(h * 0.1));
    const poolY = Math.round(hz + (h - hz) * 0.56);
    const poolRx = 46;
    const poolRy = Math.max(5, Math.round((h - hz) * 0.26));
    const cx = w / 2;
    const BG = rgbOf("--bg");
    const OUT = rgbOf("--outer");
    const WATER = rgbOf("--water");
    const INK = rgbOf("--ink");
    const ACC = rgbOf("--accent");
    const SKY = mix(BG, WATER, 0.22);
    const FAR = mix(BG, WATER, 0.3);
    const NEAR = mix(OUT, BG, 0.4);
    const POOL = mix(WATER, BG, 0.35);
    const ROCK = mix(INK, BG, 0.55);
    const MOON = mix(ACC, INK, 0.35);
    const put = (p, col) => {
      d[p] = col[0];
      d[p + 1] = col[1];
      d[p + 2] = col[2];
      d[p + 3] = 255;
    };
    for (let x = 0; x < w; x++) {
      const far = hz - 8 - (10 * Math.sin(x / 37 + 1.3) + 6 * Math.sin(x / 13 + 0.4) + 3 * Math.sin(x / 5.3) + 12) * (h / 110);
      const near = hz - 2 - (6 * Math.sin(x / 29 + 3.1) + 3 * Math.sin(x / 9 + 2) + 6) * (h / 110);
      for (let y = 0; y < h; y++) {
        const p = (y * w + x) * 4;
        const mx = x - moonX;
        const my = y - moonY;
        if (y < far) {
          // Céu: escuro em cima, clareando até a serra.
          const sky = mix(OUT, SKY, Math.pow(y / hz, 1.6));
          if (mx * mx + my * my <= moonR * moonR) put(p, mx + my > moonR * 0.6 ? mix(MOON, ACC, 0.5) : MOON);
          else if (mx * mx + my * my <= moonR * moonR * 2.6) put(p, mix(sky, MOON, 0.16)); // halo da lua
          else if (y < hz * 0.75 && hash(x, y) % 431 === 0) put(p, mix(INK, sky, 0.4));
          else put(p, sky);
        } else if (y < near) {
          put(p, mix(FAR, SKY, 0.35 + 0.35 * Math.sin((y - far) * 1.1 + x * 0.12))); // serra distante, em hachura
        } else if (y < hz) {
          put(p, mix(NEAR, FAR, 0.25 + 0.2 * Math.sin((y - near) * 1.7 - x * 0.2)));
        } else {
          const t = (y - hz) / (h - hz);
          let col = mix(mix(BG, WATER, 0.42), mix(OUT, WATER, 0.18), t); // água do onsen até a borda
          if ((y + ((x / 9) | 0)) % 4 === 0 && hash(x >> 2, y) % 3 === 0) col = mix(col, INK, 0.28); // ondinhas
          const px = (x - cx) / poolRx;
          const py = (y - poolY) / poolRy;
          const e = px * px + py * py;
          if (e <= 1) col = (y + ((x / 7) | 0)) % 3 === 0 && e < 0.8 ? mix(POOL, INK, 0.3) : mix(POOL, OUT, 0.35); // poça mais funda
          else if (e <= 1.25) col = hash(x >> 1, y) % 5 === 0 ? mix(ROCK, OUT, 0.4) : ROCK; // pedras em volta
          put(p, col);
        }
      }
    }
    ditherData(d, w, 32);
    ctx.putImageData(img, 0, 0);
    // A capivara senta com as patas na água.
    box.style.setProperty("--capy-b", `${(h - poolY - 5) * st.cell}px`);
  };
  watchDither(st);
});

// Recolore quando o tema muda (os tokens ficam no style do <html>).
new MutationObserver(repaintAll).observe(root, { attributes: true, attributeFilter: ["style", "data-site-theme"] });
dithers.forEach((d) => d.size());
repaintAll();
