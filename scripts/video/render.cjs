// Executado pelo Electron (ver scripts/video/build.mjs): fotografa cada cena de scenes.html
// em 3840×2160 e salva em PNG na pasta passada como argumento.
// A janela é invisível (offscreen) e maior que o monitor; a página é desenhada em 1920×1080
// e ampliada 2× por CSS (`zoom`), para o vídeo poder aproximar a imagem sem perder nitidez.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const OUT = process.argv[process.argv.length - 1];
const SHOTS = pathToFileURL(path.resolve("docs/screenshots")).href;
const PAGE = pathToFileURL(path.join(__dirname, "scenes.html")).href;
const W = 3840;
const H = 2160;

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    useContentSize: true,
    enableLargerThanScreen: true,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  win.setContentSize(W, H);
  const shoot = async (id) => {
    await win.loadURL(`${PAGE}?shots=${encodeURIComponent(SHOTS)}&s=${id}`);
    await win.webContents.insertCSS("html { zoom: 2; }");
    await win.webContents.executeJavaScript("window.ready");
    await new Promise((r) => setTimeout(r, 500));
    const image = await win.webContents.capturePage();
    const { width, height } = image.getSize();
    if (width !== W || height !== H) throw new Error(`cena ${id} saiu em ${width}x${height}, esperado ${W}x${H}`);
    fs.writeFileSync(path.join(OUT, `${id}.png`), image.toPNG());
    console.log(`  ${id}.png ${width}x${height}`);
  };
  try {
    await shoot("intro");
    const count = await win.webContents.executeJavaScript("window.sceneCount");
    for (let i = 0; i < count; i++) await shoot(String(i));
    await shoot("outro");
    app.exit(0);
  } catch (err) {
    console.error(String(err));
    app.exit(1);
  }
});
