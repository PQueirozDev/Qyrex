// Executado pelo Electron (ver scripts/generate-screenshots.mjs).
// Abre a demo (interface real com dados fictícios) numa janela invisível e
// salva as telas do README em docs/screenshots/.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve("dist-demo");
const OUT = path.resolve("docs/screenshots");
const SITE_OUT = path.resolve("site/assets");
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
// Perfil separado: nunca usa os dados ou preferências do app do usuário.
app.setPath("userData", fs.mkdtempSync(path.join(require("node:os").tmpdir(), "qyrex-screenshots-")));
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
      const el = [...document.querySelectorAll("button, a, [role=tab]")].filter(e => e.getClientRects().length > 0).find((e) => e.textContent.trim().startsWith(${JSON.stringify(label)}) || [...e.querySelectorAll('span')].some(s => s.textContent.trim() === ${JSON.stringify(label)}));
      if (el) el.click();
      return !!el;
    })()`);
    if (!ok) {
      fs.writeFileSync(path.resolve('.tmp/screenshot-error.html'), await js('document.body.outerHTML'));
      fs.writeFileSync(path.resolve('.tmp/screenshot-error.png'), (await win.webContents.capturePage()).toPNG());
      throw new Error(`Não achei "${label}" na tela`);
    }
    await wait(1200);
  };
  const shot = async (name, siteName) => {
    await js("document.fonts.ready");
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
    if (siteName) {
      // Usa o codificador WebP do Chromium, sem dependência de conversão externa.
      const webp = await js(`new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          canvas.getContext('2d').drawImage(image, 0, 0);
          resolve(canvas.toDataURL('image/webp', 0.85).split(',')[1]);
        };
        image.onerror = reject;
        image.src = ${JSON.stringify(img.toDataURL())};
      })`);
      fs.writeFileSync(path.join(SITE_OUT, `${siteName}.webp`), Buffer.from(webp, "base64"));
    }
    console.log(`  ${name}.png`);
  };

  await shot("inicio", "app-inicio");
  await click("IA");
  await click("Cache do catálogo"); // conversa de exemplo da demo
  await shot("ia");
  for (const [label, name] of [
    ["Projetos", "projetos"],
    ["Tarefas", "tarefas"],
    ["Agenda", "agenda"],
    ["Automações", "automacoes"],
  ]) {
    await click(label);
    await shot(name, name === "projetos" ? "app-projetos" : undefined);
  }

  // Git visual: detalhes de um projeto com o diff de um arquivo aberto.
  await click("Projetos");
  await click("Detalhes");
  await wait(800);
  await click("src/webhooks/retry.ts");
  await shot("projeto-git");
  await js(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); true`);
  await wait(600);

  // Telas da 2.2 e os ajustes recentes de navegação e consumo do próprio app.
  await click("Processos");
  await wait(2200);
  await shot("monitor", "app-monitor");
  await js(`[...document.querySelectorAll('main button')].find(e => e.textContent.trim() === 'Processos').click(); true`);
  await wait(500);
  await shot("processos", "app-processos");
  await click("Arquivos");
  await click("api-pagamentos");
  await shot("arquivos", "app-arquivos");
  await click("Workspace");
  await click("api-pagamentos");
  await shot("workspace", "app-workspace");
  await click("Preview");
  await shot("preview", "app-preview");
  await click("Utilitários");
  await shot("utilitarios", "app-utilitarios");
  await click("Plugins");
  await shot("plugins", "app-plugins");
  await click("Terminal");
  await click("Novo terminal");
  await click("Novo terminal");
  await click("Novo terminal");
  await js(`document.querySelector('button[title="Todos os terminais lado a lado"]').click(); true`);
  await wait(500);
  await shot("terminais", "app-terminais");
  await click("Início");
  await js(`document.querySelector('button[aria-label="Capivara assistente"]').click(); true`);
  await wait(700);
  await shot("capivara", "app-capivara");
  await js(`document.querySelector('[role="dialog"][aria-label="Capivara assistente"] button[aria-label="Fechar"]').click(); true`);
  await click("Início");

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
}).catch((error) => { console.error(error); app.exit(1); });
