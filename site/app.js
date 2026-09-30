// Qyrex — site. Sem dependências.

// Endereços num lugar só: trocar aqui se o repositório mudar de nome.
const LINKS = {
  repo: "https://github.com/PQueirozDev/Qyrex",
  // Os instaladores ficam em QrzSpace-releases: é o feed de atualização dos apps já instalados.
  releases: "https://github.com/PQueirozDev/QrzSpace-releases/releases",
  // Link direto do instalador: toda release publica uma cópia com nome fixo (scripts/release.mjs).
  download: "https://github.com/PQueirozDev/QrzSpace-releases/releases/latest/download/Qyrex-Setup.exe",
};
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
  freelance: [
    ["whatsapp", "Bravus pediu ajuste no horário de sábado"],
    ["vscode", "abrindo barbearia-site no VS Code"],
    ["terminal", "npm run dev em C:\\Projetos\\barbearia-site"],
    ["claude", "claude: onde ficam os horários da agenda?"],
    ["github", "commit \"horário de sábado até 14h\" (confirmado)"],
    ["whatsapp", "mensagem pronta para a Bravus", true],
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
    ["github", "push da tag v1.7.0 (confirmado)"],
    ["agenda", "lembrete: avisar clientes amanhã 9h"],
    ["spotify", "tocando: lo-fi para deploy", true],
  ],
  conteudo: [
    ["agenda", "quinta 19:00: reels da Lúmina"],
    ["claude", "claude: três ganchos para antes e depois"],
    ["vscode", "abrindo a pasta de arquivos do cliente"],
    ["whatsapp", "enviar prévia para aprovação"],
    ["agenda", "post movido para Pronto", true],
  ],
};
const logEl = orch.querySelector("[data-log]");
const sceneLabel = orch.querySelector("[data-log-scene]");
const hubStatus = orch.querySelector("[data-hub-status]");
let scene = "freelance";
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
startScene("freelance");

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
