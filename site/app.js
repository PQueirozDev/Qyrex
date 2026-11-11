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

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- Orquestra: fios do centro até cada programa + cenários ------------------------

const orch = document.querySelector(".orch");
const svg = orch.querySelector(".wires");
const hub = orch.querySelector(".hub");
const nodes = Object.fromEntries([...orch.querySelectorAll(".node")].map((n) => [n.dataset.node, n]));
const wires = {};

function drawWires() {
  const box = orch.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  const h = hub.getBoundingClientRect();
  const hx = h.left + h.width / 2 - box.left;
  const hy = h.top + h.height / 2 - box.top;
  for (const [id, n] of Object.entries(nodes)) {
    const r = n.getBoundingClientRect();
    const nx = r.left + r.width / 2 - box.left;
    const ny = r.top + r.height / 2 - box.top;
    // Cotovelo em ângulo reto: sai do centro na horizontal, desce/sobe e chega no cartão.
    const mx = (hx + nx) / 2;
    const d = Math.abs(nx - hx) < 40 ? `M${hx},${hy} L${nx},${ny}` : `M${hx},${hy} L${mx},${hy} L${mx},${ny} L${nx},${ny}`;
    let p = wires[id];
    if (!p) {
      p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.appendChild(p);
      wires[id] = p;
    }
    p.setAttribute("d", d);
  }
}
drawWires();
new ResizeObserver(drawWires).observe(orch);
document.fonts?.ready.then(drawWires);

const SCENES = {
  feature: [
    ["vscode", "abrindo barbearia-site no VS Code"],
    ["terminal", "npm run dev em C:\\Projetos\\barbearia-site"],
    ["claude", "claude: onde ficam os horários da agenda?"],
    ["explorer", "abrindo a pasta src/pages"],
    ["github", "commit \"horário de sábado até 14h\" (confirmado)", true],
  ],
  bug: [
    ["github", "issue #42: agenda não salva no Safari"],
    ["vscode", "abrindo loja-online na pasta certa"],
    ["codex", "codex: explica esse erro de Date no Safari"],
    ["terminal", "npm test -- agenda (3 passaram)"],
    ["github", "PR #43 aberto: corrige parse de data", true],
  ],
  release: [
    ["terminal", "npm run check (typecheck, lint, testes)"],
    ["claude", "claude: resume as mudanças para o changelog"],
    ["github", "push da tag v2.3.1 (confirmado)"],
    ["agenda", "lembrete: conferir o deploy amanhã 9h"],
    ["spotify", "tocando: lo-fi para deploy", true],
  ],
  review: [
    ["github", "PR #51 pede revisão: cache do catálogo"],
    ["terminal", "git fetch e checkout da branch do PR"],
    ["codex", "codex: riscos desse diff no cache?"],
    ["terminal", "npm test (todos passaram)"],
    ["github", "comentário enviado no PR #51", true],
  ],
};
const logEl = orch.querySelector("[data-log]");
const sceneLabel = orch.querySelector("[data-log-scene]");
const hubStatus = orch.querySelector("[data-hub-status]");
let scene = "feature";
let step = 0;
let timer = null;

function showStep() {
  const steps = SCENES[scene];
  Object.values(nodes).forEach((n) => n.classList.remove("on"));
  Object.values(wires).forEach((w) => w.classList.remove("live"));
  if (step >= steps.length) {
    hub.classList.remove("busy");
    hubStatus.textContent = "tudo pronto";
    step = 0;
    timer = setTimeout(() => {
      logEl.innerHTML = "";
      showStep();
    }, 2600);
    return;
  }
  const [id, text, done] = steps[step];
  nodes[id].classList.add("on");
  wires[id]?.classList.add("live");
  hub.classList.add("busy");
  hubStatus.textContent = nodes[id].querySelector(".n-name").textContent.toLowerCase();
  const li = document.createElement("li");
  li.textContent = text;
  if (done) li.className = "ok";
  logEl.appendChild(li);
  while (logEl.children.length > 5) logEl.firstElementChild.remove();
  step++;
  timer = setTimeout(showStep, 1500);
}

function startScene(name) {
  clearTimeout(timer);
  scene = name;
  step = 0;
  logEl.innerHTML = "";
  sceneLabel.textContent = orch.querySelector(`[data-scene="${name}"]`).textContent;
  orch.querySelectorAll("[data-scene]").forEach((b) => {
    const on = b.dataset.scene === name;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  if (reduced) {
    // Sem animação: mostra o cenário inteiro de uma vez.
    for (const [id, text, done] of SCENES[name]) {
      const li = document.createElement("li");
      li.textContent = text;
      if (done) li.className = "ok";
      logEl.appendChild(li);
      nodes[id].classList.add("on");
    }
    while (logEl.children.length > 5) logEl.firstElementChild.remove();
    return;
  }
  showStep();
}
orch.querySelectorAll("[data-scene]").forEach((b) => b.addEventListener("click", () => startScene(b.dataset.scene)));
startScene("feature");

// --- Temas: os mesmos do app, recolorindo a página -------------------------------

const THEMES = {
  onsen: { desc: "Noite azul e laranja de yuzu. O tema deste site.", vars: {} },
  dark: {
    desc: "Grafite neutro com azul. O padrão do app.",
    vars: { bg: "#0b0d10", outer: "#060709", card: "#15181d", sunken: "#111418", ink: "#e6e8eb", "ink-dim": "#9aa1ac", "ink-mute": "#686f7a", accent: "#688cff", "accent-on": "#ffffff", line: "rgba(255,255,255,0.07)", "line-2": "rgba(255,255,255,0.13)", water: "#8fb4ff" },
  },
  light: {
    desc: "Limpo e neutro para ambientes iluminados.",
    vars: { bg: "#f6f7f9", outer: "#e9ebef", card: "#ffffff", sunken: "#eef0f3", ink: "#16181d", "ink-dim": "#585e6a", "ink-mute": "#8a909c", accent: "#4c6ef5", "accent-on": "#ffffff", line: "rgba(20,24,40,0.08)", "line-2": "rgba(20,24,40,0.14)", water: "#2b8a91", tick: "rgba(20,24,40,0.4)", ok: "#2f9e55", warn: "#b7791f" },
  },
  midnight: {
    desc: "Azul profundo com destaque ciano.",
    vars: { bg: "#070b16", outer: "#04070e", card: "#0f172a", sunken: "#0b1120", ink: "#e2e8f0", "ink-dim": "#94a3b8", "ink-mute": "#64748b", accent: "#22d3ee", "accent-on": "#031721", line: "rgba(148,163,184,0.09)", "line-2": "rgba(148,163,184,0.16)", water: "#67e8f9" },
  },
  violet: {
    desc: "Roxo escuro e lavanda, para as madrugadas.",
    vars: { bg: "#0d0b14", outer: "#07060b", card: "#181423", sunken: "#13101c", ink: "#ebe7f5", "ink-dim": "#a79fbd", "ink-mute": "#7a7190", accent: "#a78bfa", "accent-on": "#140c28", line: "rgba(200,180,255,0.08)", "line-2": "rgba(200,180,255,0.15)", water: "#c4b5fd" },
  },
  sand: {
    desc: "Papel quente e terracota, claro e calmo.",
    vars: { bg: "#f7f3ec", outer: "#ece5d8", card: "#fffdf9", sunken: "#f1ebe1", ink: "#2b241c", "ink-dim": "#6e6254", "ink-mute": "#978a78", accent: "#c95a26", "accent-on": "#ffffff", line: "rgba(60,40,20,0.09)", "line-2": "rgba(60,40,20,0.16)", water: "#2f7f86", tick: "rgba(60,40,20,0.4)", ok: "#3f8f4f", warn: "#a86a12" },
  },
};
const ALL_VARS = [...new Set(Object.values(THEMES).flatMap((t) => Object.keys(t.vars)))];
const root = document.documentElement;
const descEl = document.querySelector("[data-theme-desc]");

function applyTheme(id) {
  const t = THEMES[id] ?? THEMES.onsen;
  ALL_VARS.forEach((v) => root.style.removeProperty(`--${v}`));
  Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
  root.dataset.siteTheme = id;
  descEl.textContent = t.desc;
  document.querySelectorAll("[data-theme-id]").forEach((b) => {
    const on = b.dataset.themeId === id;
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  });
  try {
    localStorage.setItem("qyrex-site-theme", id);
  } catch {
    /* sem armazenamento: tudo bem */
  }
}
document.querySelectorAll("[data-theme-id]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.themeId)));
try {
  const saved = localStorage.getItem("qyrex-site-theme");
  if (saved && THEMES[saved]) applyTheme(saved);
} catch {
  /* ignora */
}

// --- Copiar comandos --------------------------------------------------------------

const copyBtn = document.querySelector("[data-copy]");
copyBtn?.addEventListener("click", async () => {
  const pre = document.querySelector("[data-copy-src]");
  const text = pre.innerText
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .map((l) => l.replace(/\s+#.*$/, ""))
    .join("\n");
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "copiado";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    copyBtn.textContent = "selecionado";
  }
  setTimeout(() => (copyBtn.textContent = "copiar"), 1800);
});

// --- Pontilhado colorido (Bayer 8×8) ----------------------------------------------
// O vídeo do onsen e a paisagem do rodapé passam por um pontilhado ordenado em poucas
// cores: a pixel art mantém a paleta do Qyrex e ganha a textura de ponto das referências.
// A paisagem do rodapé é pintada com os tokens, então trocar de tema recolore.

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

/** Reduz cada canal a `levels` níveis com o limiar de Bayer: sobra o padrão de pontos. */
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
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, st.w, st.h);
    ctx.drawImage(src, (st.w - dw) * focus, (st.h - dh) * 0.5, dw, dh);
    const img = ctx.getImageData(0, 0, st.w, st.h);
    ditherData(img.data, st.w, 6);
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
    let seen = false;
    let last = 0;
    const tick = (t) => {
      if (!seen) return;
      if (t - last > 80) {
        last = t;
        st.paint();
      }
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => {
      const was = seen;
      seen = e.isIntersecting;
      if (seen) video.play().catch(() => {});
      else video.pause();
      if (seen && !was) requestAnimationFrame(tick);
    }).observe(canvas.parentElement);
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
          else if (y < hz * 0.75 && hash(x, y) % 173 === 0) put(p, INK);
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
    ditherData(d, w, 5);
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

// --- Telas do app: os botões trocam o print -------------------------------------------

{
  const img = document.querySelector("[data-shot-img]");
  const title = document.querySelector("[data-shot-title]");
  const tabs = [...document.querySelectorAll("[data-shot]")];
  tabs.forEach((b) =>
    b.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.toggle("on", t === b);
        t.setAttribute("aria-pressed", String(t === b));
      });
      title.textContent = b.dataset.title;
      const next = new Image();
      next.src = `assets/app-${b.dataset.shot}.webp`;
      img.classList.add("swap");
      const show = () => {
        img.src = next.src;
        img.classList.remove("swap");
      };
      // Troca só depois de carregar (ou de falhar), para não piscar uma imagem quebrada.
      next.decode().then(show, show);
    }),
  );
}

// --- Frase central: as palavras acendem em ordem conforme a página rola -------------

{
  const el = document.querySelector("[data-reveal-words]");
  if (el) {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    const spans = words.map((w, i) => {
      const s = document.createElement("span");
      s.className = "w";
      s.textContent = w;
      el.append(s, i < words.length - 1 ? " " : "");
      return s;
    });
    let lit = 0;
    let queued = false;
    const update = () => {
      queued = false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Começa quando o topo do texto passa de 85% da tela e termina com o fim dele em 55%.
      const p = (vh * 0.85 - r.top) / (r.height + vh * 0.3);
      const n = Math.max(lit, Math.min(spans.length, Math.ceil(p * spans.length)));
      for (; lit < n; lit++) spans[lit].classList.add("on");
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) window.addEventListener("scroll", onScroll, { passive: true });
      else window.removeEventListener("scroll", onScroll);
      update();
    }).observe(el);
  }
}

// --- Entrada das seções, item atual do menu e menu do celular ------------------------

root.classList.add("js");
{
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      }),
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll("main > section:not(.hero) > *:not(.brk)").forEach((el) => {
    el.classList.add("rv");
    io.observe(el);
  });

  const navLinks = [...document.querySelectorAll(".nav a")];
  const spy = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((a) => {
          if (a.getAttribute("href") === `#${e.target.id}`) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      }),
    { rootMargin: "-45% 0px -50% 0px" },
  );
  document.querySelectorAll("main > section[id]").forEach((s) => spy.observe(s));

  const menu = document.getElementById("menu");
  const menuBtn = document.querySelector(".menu-btn");
  const setMenu = (open) => {
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    document.body.classList.toggle("locked", open);
    document.querySelector("main").inert = open;
    document.querySelector(".foot").inert = open;
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("open")));
      menu.querySelector("a")?.focus({ preventScroll: true });
    } else {
      if (menu.contains(document.activeElement)) menuBtn.focus({ preventScroll: true });
      menu.classList.remove("open");
      setTimeout(() => {
        if (menuBtn.getAttribute("aria-expanded") === "false") menu.hidden = true;
      }, 300);
    }
  };
  menuBtn.addEventListener("click", () => setMenu(menuBtn.getAttribute("aria-expanded") !== "true"));
  menu.addEventListener("click", (e) => e.target.closest("a") && setMenu(false));
  document.addEventListener("keydown", (e) => {
    if (menuBtn.getAttribute("aria-expanded") !== "true") return;
    if (e.key === "Escape") return setMenu(false);
    if (e.key !== "Tab") return;
    // Tab circula entre o botão de fechar e os links do menu.
    const items = [menuBtn, ...menu.querySelectorAll("a")];
    const i = items.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === items.length - 1 ? 0 : i + 1;
    e.preventDefault();
    items[next].focus();
  });
  window.matchMedia("(min-width: 761px)").addEventListener("change", (e) => e.matches && setMenu(false));
}

// --- Versão publicada: lida da última release (o HTML traz um valor de reserva) -------

{
  const show = (v) => document.querySelectorAll("[data-version]").forEach((el) => (el.textContent = v));
  const valid = (v) => typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v);
  let cached = null;
  try {
    cached = sessionStorage.getItem("qyrex-version");
  } catch {
    /* sem armazenamento */
  }
  if (valid(cached)) show(cached);
  else
    fetch(LINKS.latestApi)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v = String(j?.tag_name ?? "").replace(/^v/, "");
        if (!valid(v)) return;
        show(v);
        try {
          sessionStorage.setItem("qyrex-version", v);
        } catch {
          /* ignora */
        }
      })
      .catch(() => {});
}

// --- Perguntas em dados estruturados (para buscadores e assistentes) -----------------

{
  const items = [...document.querySelectorAll("[data-faq] > div")].map((d) => ({
    "@type": "Question",
    name: d.querySelector("dt").textContent.trim(),
    acceptedAnswer: { "@type": "Answer", text: d.querySelector("dd").textContent.trim() },
  }));
  if (items.length) {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items });
    document.head.appendChild(s);
  }
}
