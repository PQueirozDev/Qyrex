// Executado pelo Electron (ver scripts/generate-icons.mjs).
// Gera as imagens do instalador NSIS a partir de build/icon.svg:
//   build/installerSidebar.bmp    (164×314 — boas-vindas e conclusão)
//   build/uninstallerSidebar.bmp  (164×314 — desinstalador)
//   build/installerHeader.bmp     (150×57  — cabeçalho das demais páginas)
// O NSIS só aceita BMP de 24 bits; cada arte é um HTML renderizado numa janela
// invisível, capturado e convertido aqui mesmo.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const BUILD = path.resolve("build");
const svg = fs.readFileSync(path.join(BUILD, "icon.svg"), "utf8");
const iconUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const font = fs
  .readFileSync(path.resolve("node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"))
  .toString("base64");

// Cores da marca (tema Onsen e do próprio ícone).
const NIGHT = "#0d1020";
const NIGHT_2 = "#18203d";
const ORANGE = "#ff9a3c";
const WATER = ["#8fe0e0", "#3fa3a8", "#236b77"];

const base = `
  @font-face { font-family: Inter; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { overflow: hidden; font-family: Inter, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  img.px { image-rendering: pixelated; display: block; }
  /* Camada própria: o Chromium usa antialiasing em cinza (sem franja do ClearType). */
  .name, .cap { will-change: transform; }
`;

/** Estrelas em pixel art, em posições fixas (a arte sai sempre igual). */
function stars() {
  const pts = [
    [14, 18, 2], [38, 42, 1], [61, 12, 1], [97, 26, 2], [131, 14, 1], [148, 46, 2],
    [22, 74, 1], [142, 88, 1], [9, 120, 1], [152, 132, 2], [118, 60, 1], [79, 50, 1],
  ];
  return pts
    .map(([x, y, s]) => `<i style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:#f6ecc9;opacity:${s === 2 ? 0.85 : 0.5}"></i>`)
    .join("");
}

/** Água do onsen: faixas com as cores do ícone e pequenas ondas em pixel. */
function water(width) {
  const crest = [];
  for (let x = 6; x < width; x += 22) crest.push(`<i style="position:absolute;left:${x}px;top:6px;width:8px;height:2px;background:#5cc0c4"></i>`);
  return `
    <div style="position:absolute;left:0;right:0;bottom:0;height:34px">
      <div style="height:2px;background:${WATER[0]}"></div>
      <div style="height:2px;background:${WATER[1]}"></div>
      <div style="position:relative;height:30px;background:${WATER[2]}">${crest.join("")}</div>
    </div>`;
}

function sidebar(caption) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    body { width: 164px; height: 314px; position: relative;
      background: radial-gradient(120px 120px at 82px 118px, rgba(255,154,60,.20), transparent 70%),
                  linear-gradient(180deg, ${NIGHT} 0%, ${NIGHT_2} 100%); }
    .logo { position: absolute; left: 34px; top: 70px; width: 96px; height: 96px; border-radius: 18px; overflow: hidden;
      box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 10px 28px -8px rgba(0,0,0,.7), 0 0 30px -6px rgba(255,154,60,.45); }
    .name { position: absolute; left: 0; right: 0; top: 184px; text-align: center; color: #eef0f8;
      font-size: 30px; font-weight: 800; letter-spacing: -0.8px; }
    .bar { position: absolute; left: 70px; top: 228px; width: 24px; height: 3px; border-radius: 2px; background: ${ORANGE}; }
    .cap { position: absolute; left: 0; right: 0; top: 240px; text-align: center; color: #a0a7c2;
      font-size: 9px; font-weight: 600; letter-spacing: 2.4px; }
  </style></head><body>
    ${stars()}
    <img class="px logo" src="${iconUrl}" width="96" height="96">
    <div class="name">Qyrex</div>
    <div class="bar"></div>
    <div class="cap">${caption}</div>
    ${water(164)}
  </body></html>`;
}

function header() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base}
    body { width: 150px; height: 57px; background: #ffffff; display: flex; align-items: center; justify-content: flex-end; gap: 9px; padding-right: 12px; }
    img { width: 32px; height: 32px; border-radius: 7px; }
    .name { font-size: 19px; font-weight: 800; letter-spacing: -0.5px; color: #141a33; }
    .dot { color: ${ORANGE}; }
  </style></head><body>
    <img class="px" src="${iconUrl}" width="32" height="32">
    <div class="name">Qyrex<span class="dot">.</span></div>
  </body></html>`;
}

/** BMP de 24 bits (linhas de baixo para cima, alinhadas a 4 bytes). */
function toBmp(bgra, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixels = rowSize * height;
  const buf = Buffer.alloc(54 + pixels);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + pixels, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixels, 34);
  buf.writeInt32LE(2835, 38); // 72 dpi
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const dst = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      buf[dst + x * 3] = bgra[src];
      buf[dst + x * 3 + 1] = bgra[src + 1];
      buf[dst + x * 3 + 2] = bgra[src + 2];
    }
  }
  return buf;
}

async function render(win, html, width, height, file) {
  win.setContentSize(width, height);
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
  await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
  await new Promise((r) => setTimeout(r, 300));
  let img = await win.webContents.capturePage({ x: 0, y: 0, width, height });
  const size = img.getSize();
  if (size.width !== width || size.height !== height) img = img.resize({ width, height, quality: "best" });
  fs.writeFileSync(path.join(BUILD, file), toBmp(img.toBitmap(), width, height));
}

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 164,
    height: 314,
    show: false,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  await render(win, sidebar("WORKSPACE"), 164, 314, "installerSidebar.bmp");
  await render(win, sidebar("ATÉ LOGO"), 164, 314, "uninstallerSidebar.bmp");
  await render(win, header(), 150, 57, "installerHeader.bmp");
  console.log(`Artes do instalador geradas em ${BUILD} (sidebar 164×314 + header 150×57)`);
  app.quit();
});
