// Verificação local com o Electron já instalado no repositório. Não publica nada.
const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = __dirname;
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'qyrex-site-qa-')));
app.commandLine.appendSwitch('force-prefers-reduced-motion');
let apiMode = 'success';
const fixture = { name: 'Release de teste', tag_name: 'v9.8.7', published_at: '2026-11-13T12:00:00Z', assets: [{ name: 'Qyrex-Setup.exe', size: 10485760 }], body: '# Novidades\n- **Item realçado**\n<script>window.injetado=true</script>\n<img src=x onerror=alert(1)>' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api') {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Access-Control-Allow-Origin', '*');
    if (apiMode === 'failure') { res.writeHead(503); return res.end('{}'); }
    return res.end(JSON.stringify(url.searchParams.has('list') ? [fixture] : fixture));
  }
  let name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
  if (!path.extname(name)) name += '.html';
  const file = path.resolve(base, name);
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Não encontrado'); }
  const types = { '.html': 'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.webm':'video/webm', '.mp4':'video/mp4', '.woff2':'font/woff2' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'text/plain'); fs.createReadStream(file).pipe(res);
});
const assert = (condition, text) => { if (!condition) throw new Error(text); };
app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(4174, '127.0.0.1', resolve));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://api.github.com/repos/PQueirozDev/QrzSpace-releases/*'] }, (details, callback) => callback({ redirectURL: 'http://127.0.0.1:4174/api' + (details.url.includes('per_page') ? '?list' : '') }));
  const win = new BrowserWindow({ show:false, useContentSize:true, width:375, height:900, webPreferences:{ offscreen:true, backgroundThrottling:false, contextIsolation:true, nodeIntegration:false, sandbox:true } });
  const errors=[];
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && !message.includes('503')) errors.push(message); });
  fs.mkdirSync(path.join(base,'verification'),{recursive:true});
  const run = code => win.webContents.executeJavaScript(code);
  const wait = () => new Promise(resolve => setTimeout(resolve, 550));
  for (const width of [360,375,1440]) {
    win.setContentSize(width,900);
    for (const page of ['', 'download','docs','roadmap','changelog']) {
      await win.loadURL('http://127.0.0.1:4174/'+page); await wait();
      assert(await run('document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= document.body.clientWidth'), `Rolagem horizontal: ${page} em ${width}`);
      const broken = await run(`(async()=>{const bad=[];for(const el of document.querySelectorAll('a[href],img[src],script[src],link[rel="stylesheet"]')){const raw=el.getAttribute('href')||el.getAttribute('src');const u=new URL(raw,location.href);if(u.origin!==location.origin)continue;const r=await fetch(u);if(!r.ok)bad.push(raw);if(u.hash&&u.pathname===location.pathname&&!document.getElementById(u.hash.slice(1)))bad.push(raw);}return bad;})()`);
      assert(!broken.length, 'Links quebrados: '+broken.join(', '));
      if (!page) {
        assert(await run(`(()=>{const steps=[...document.querySelectorAll('[data-tour-step]')];steps[0].focus();steps[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));return document.activeElement===steps[1]&&steps[1].getAttribute('aria-pressed')==='true'&&document.querySelector('[data-tour-image]').getAttribute('src')==='assets/app-processos.webp';})()`),'Teclado do tour guiado');
        assert(await run(`(()=>{const steps=[...document.querySelectorAll('[data-tour-step]')];steps[2].click();return steps.filter(s=>s.getAttribute('aria-pressed')==='true').length===1&&document.querySelector('[data-tour-image]').alt.includes('Workspace');})()`),'Seleção do tour guiado');
        if (width === 1440) {
          await run(`document.querySelector('[data-tour-step]').click();document.querySelectorAll('[data-tour-marker]')[2].scrollIntoView({block:'center',behavior:'instant'})`); await wait();
          assert(await run(`document.querySelectorAll('[data-tour-step]')[2].getAttribute('aria-pressed')==='true'`),'Tour acompanha a rolagem em tela larga');
          fs.writeFileSync(path.join(base,'verification','tour-desktop.png'),(await win.webContents.capturePage()).toPNG());
          await run(`scrollTo({top:0,behavior:'instant'})`); await wait();
        }
        await run(`document.querySelector('.tour-gallery').open=true`);
        assert(await run(`(()=>{const t=document.querySelector('[role=tab]');t.focus();t.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return document.activeElement.id==='tab-processos'&&!document.querySelector('#panel-processos').hidden;})()`),'Seta do tour');
        assert(await run(`document.querySelector('.dither-src').paused`),'Movimento reduzido');
        await run(`document.querySelector('#tab-workspace').click()`);
        await run(`document.querySelector('.tour-gallery').open=false;document.querySelector('[data-tour-step]').click()`);
      }
      assert(await run(`(()=>{const b=document.querySelector('#site-theme');b.click();const options=[...document.querySelectorAll('#site-theme-options [role=option]')];const result=options.length===6&&options.every(o=>!!o.querySelector('.mini-onsen svg image'));b.click();return result;})()`),'Seletor de temas com cenas');
      if (!page) {
        await run(`document.querySelector('#site-theme').click()`); await wait();
        fs.writeFileSync(path.join(base,'verification',`theme-menu-${width}.png`),(await win.webContents.capturePage()).toPNG());
        await run(`document.querySelector('#site-theme').click()`);
      }
      if (page==='docs') {
        assert(await run(`(()=>{const s=document.querySelector('#docs-search');s.value='CONFIGURACAO';s.dispatchEvent(new Event('input'));return !document.querySelector('#configuracao').hidden;})()`),'Busca sem acento');
        assert(await run(`(()=>{const s=document.querySelector('#docs-search');s.value='xyznenhumresultado';s.dispatchEvent(new Event('input'));return !document.querySelector('[data-no-results]').hidden;})()`),'Busca sem resultado');
        await run(`document.querySelector('#docs-search').value='';document.querySelector('#docs-search').dispatchEvent(new Event('input'))`);
      }
      if (page==='download') assert(await run(`document.querySelector('[data-release-version]').textContent==='v9.8.7'&&document.querySelector('[data-release-size]').textContent==='10 MiB'`),'Dados reais da resposta');
      if (page==='changelog') assert(await run(`document.querySelector('.release-entry strong').textContent==='Item realçado'&&!document.querySelector('.release-entry script')&&!document.querySelector('.release-entry img')&&!window.injetado`),'Markdown seguro');
      await run('document.fonts.ready');
      await run(`document.activeElement?.blur();document.body.scrollTo(0,0);window.scrollTo(0,0)`);
      await wait();
      fs.writeFileSync(path.join(base,'verification',`${page||'index'}-${width}.png`),(await win.webContents.capturePage()).toPNG());
      console.log(`OK ${page||'index'} ${width}px`);
    }
  }
  apiMode='failure';
  for (const page of ['download','changelog']) {
    await win.loadURL('http://127.0.0.1:4174/'+page); await wait();
    assert(await run(`document.body.textContent.includes('Não foi possível')`),'Fallback '+page);
    if(page==='download') assert(await run(`document.querySelector('[data-release-version]').textContent.trim()==='veja na página de releases'`),'Sem versão inventada');
    console.log('OK falha da API: '+page);
  }
  assert(!errors.length,'Console: '+errors.join('\n'));
  console.log('OK console, links, tour, busca, movimento reduzido, API e Markdown');
  win.destroy(); server.close(); app.quit();
}).catch(error=>{console.error(error);server.close();app.exit(1);});
