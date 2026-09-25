// Executado pelo Electron (ver scripts/generate-icons.mjs).
const { app, BrowserWindow, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const BUILD = path.resolve("build");
const SVG = path.join(BUILD, "icon.svg");
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const RENDER = 1024;

/** .ico com cada tamanho guardado como PNG. */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: RENDER,
    height: RENDER,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  const svg = fs.readFileSync(SVG, "utf8");
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:${RENDER}px;height:${RENDER}px;display:block"></body></html>`;
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
  await new Promise((r) => setTimeout(r, 400));
  const full = await win.webContents.capturePage({ x: 0, y: 0, width: RENDER, height: RENDER });
  const at = (size) => full.resize({ width: size, height: size, quality: "best" }).toPNG();

  fs.writeFileSync(path.join(BUILD, "icon.png"), at(512));
  fs.writeFileSync(path.join(BUILD, "icon.ico"), buildIco(ICO_SIZES.map((size) => ({ size, data: at(size) }))));
  console.log(`Ícones gerados em ${BUILD} (png 512 + ico ${ICO_SIZES.join("/")})`);
  app.quit();
});
