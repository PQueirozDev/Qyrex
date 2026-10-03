// Executado pelo Electron (ver scripts/generate-screenshots.mjs).
// Abre a demo (interface real com dados fictícios) numa janela invisível e
// salva as telas do README em docs/screenshots/.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve("dist-demo");
const OUT = path.resolve("docs/screenshots");
const W = 1440;
const H = 900;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp" };

/** Servidor estático mínimo (módulos ES não carregam por file://). */
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.join(ROOT, rel === "/" ? "index.html" : rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  if (!fs.existsSync(path.join(ROOT, "index.html"))) {
    console.error("dist-demo/ não existe: rode npm run build:demo antes.");
    app.exit(1);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  const js = (code) => win.webContents.executeJavaScript(code);

  // Sem animação de abertura e sem o selo "Demo".
  await win.loadURL(url);
  await js(`localStorage.setItem("qrz.splash", "0"); true`);
  await win.loadURL(url);
  await win.webContents.insertCSS(".demo-badge { display: none !important; }");
  await wait(1500);

  /** Clica no primeiro botão/link cujo texto começa com `label`. */
  const click = async (label) => {
    const ok = await js(`(() => {
      const el = [...document.querySelectorAll("button, a, [role=tab]")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(label)}));
      if (el) el.click();
      return !!el;
    })()`);
    if (!ok) throw new Error(`Não achei "${label}" na tela`);
    await wait(1200);
  };
  const shot = async (name) => {
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
    console.log(`  ${name}.png`);
  };

  await shot("inicio");
  await click("IA");
  await click("Ideias para a página"); // conversa de exemplo da demo
  await shot("ia");
  for (const [label, name] of [
    ["Projetos", "projetos"],
    ["Tarefas", "tarefas"],
    ["Agenda", "agenda"],
    ["Clientes", "clientes"],
    ["Marketing", "marketing"],
  ]) {
    await click(label);
    await shot(name);
  }

  // Temas: escolhidos em Configurações → Aparência, fotografados no Início.
  for (const [label, name] of [
    ["Onsen", "tema-onsen"],
    ["Claro", "tema-claro"],
    ["Violeta", "tema-violeta"],
  ]) {
    await click("Configurações");
    await click("Aparência");
    await click(label);
    await click("Início");
    await shot(name);
  }

  console.log(`Screenshots salvos em ${OUT}`);
  server.close();
  app.quit();
});
