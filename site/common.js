// Navegação, tour e busca sem dependências externas.
const menuButton = document.querySelector('.menu-btn');
const menu = document.querySelector('#menu');
menuButton.hidden = false;
document.documentElement.classList.add('js');
const closeMenu = () => menuButton.setAttribute('aria-expanded', 'false');
menuButton.addEventListener('click', () => menuButton.setAttribute('aria-expanded', String(menuButton.getAttribute('aria-expanded') !== 'true')));
menu.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') { closeMenu(); menuButton.focus(); }
});
document.querySelectorAll('nav a').forEach((a) => {
  if (new URL(a.href).pathname === location.pathname && !new URL(a.href).hash) a.setAttribute('aria-current', 'page');
});

// Abas com foco itinerante: setas, Home e End também selecionam o painel.
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  tabs.forEach((item) => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const offsets = { ArrowRight: 1, ArrowLeft: -1 };
    let next;
    if (event.key in offsets) next = (index + offsets[event.key] + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); selectTab(tabs[next]); tabs[next].focus();
  });
});

const search = document.querySelector('#docs-search');
if (search) {
  const sections = [...document.querySelectorAll('[data-doc-section]')];
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filter = () => {
    const query = normalize(search.value.trim());
    let count = 0;
    sections.forEach((section) => {
      section.hidden = !normalize(section.textContent).includes(query);
      document.querySelector(`.docs-nav a[href="#${section.id}"]`).hidden = section.hidden;
      if (!section.hidden) count++;
    });
    document.querySelector('[data-search-status]').textContent = `${count} seções encontradas`;
    document.querySelector('[data-no-results]').hidden = count !== 0;
  };
  search.addEventListener('input', filter);
  // Um link direto continua abrindo a seção mesmo depois de uma busca.
  window.addEventListener('hashchange', () => {
    search.value = ''; filter();
    document.getElementById(location.hash.slice(1))?.scrollIntoView();
  });
}

// O tema acompanha a mesma paleta do aplicativo e vale em todas as páginas.
const texture = document.querySelector('#texture');
const siteThemes = ['onsen', 'dark', 'light', 'midnight', 'violet', 'sand'];
const themeChoices = [
  { id:'onsen', name:'Onsen', colors:['#0d1020', '#7fd4d8', '#ff9a3c'] },
  { id:'dark', name:'Escuro', colors:['#131418', '#9b9fa8', '#ff9a3c'] },
  { id:'light', name:'Claro', colors:['#f6f7f9', '#dee1e6', '#c2570c'] },
  { id:'midnight', name:'Meia-noite', colors:['#070b16', '#1e293b', '#22d3ee'] },
  { id:'violet', name:'Violeta', colors:['#0d0b14', '#302656', '#a78bfa'] },
  { id:'sand', name:'Areia', colors:['#f7f3ec', '#e4dbcd', '#c95a26'] },
];
const themeControls = [];
function createThemeControl(id) {
  const control = document.createElement('div');
  control.className = 'theme-control';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = id;
  trigger.className = 'theme-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${id}-options`);
  const swatch = document.createElement('span');
  swatch.className = 'theme-swatch';
  swatch.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'theme-label';
  const arrow = document.createElement('span');
  arrow.className = 'theme-chevron';
  arrow.setAttribute('aria-hidden', 'true');
  trigger.append(swatch, label, arrow);
  const panel = document.createElement('div');
  panel.id = `${id}-options`;
  panel.className = 'theme-options';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', 'Tema do site');
  panel.hidden = true;
  const heading = document.createElement('span');
  heading.className = 'theme-heading';
  heading.textContent = 'Aparência';
  heading.setAttribute('aria-hidden', 'true');
  panel.append(heading);
  const options = themeChoices.map((theme) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'theme-option';
    option.setAttribute('role', 'option');
    option.dataset.theme = theme.id;
    option.tabIndex = -1;
    const preview = swatch.cloneNode();
    preview.style.background = `linear-gradient(135deg, ${theme.colors[0]} 45%, ${theme.colors[1]} 45% 72%, ${theme.colors[2]} 72%)`;
    const name = document.createElement('span');
    name.textContent = theme.name;
    const check = document.createElement('span');
    check.className = 'theme-check';
    check.textContent = '\u2713';
    check.setAttribute('aria-hidden', 'true');
    option.append(preview, name, check);
    option.addEventListener('click', () => {
      applySiteTheme(theme.id);
      close();
      trigger.focus();
    });
    panel.append(option);
    return option;
  });
  function close() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }
  function open() {
    themeControls.forEach((item) => item.close());
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    (options.find((option) => option.getAttribute('aria-selected') === 'true') || options[0]).focus();
  }
  trigger.addEventListener('click', () => panel.hidden ? open() : close());
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
  });
  panel.addEventListener('keydown', (event) => {
    const index = options.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.focus(); }
    if (next !== undefined) { event.preventDefault(); options[next].focus(); }
  });
  control.addEventListener('focusout', (event) => { if (!control.contains(event.relatedTarget)) close(); });
  document.addEventListener('pointerdown', (event) => { if (!control.contains(event.target)) close(); });
  control.append(trigger, panel);
  themeControls.push({ trigger, swatch, label, options, close });
  return control;
}
const headerActions = document.createElement('div');
headerActions.className = 'header-actions';
headerActions.append(createThemeControl('site-theme'));
const headerDownload = menu.querySelector('a[href="/download"]');
if (headerDownload) {
  headerDownload.className = 'nav-download';
  headerDownload.textContent = '';
  const label = document.createElement('span');
  label.className = 'download-label';
  label.textContent = 'Baixar';
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '\u2193';
  headerDownload.setAttribute('aria-label', 'Baixar Qyrex');
  headerDownload.append(label, icon);
  headerActions.append(headerDownload);
}
document.querySelector('.topbar').append(headerActions);
if (texture) texture.replaceWith(createThemeControl('texture'));
function applySiteTheme(theme) {
  if (!siteThemes.includes(theme)) theme = 'onsen';
  root.dataset.siteTheme = theme;
  const choice = themeChoices.find((item) => item.id === theme);
  themeControls.forEach(({ trigger, swatch, label, options }) => {
    label.textContent = choice.name;
    trigger.setAttribute('aria-label', `Tema do site: ${choice.name}`);
    swatch.style.background = `linear-gradient(135deg, ${choice.colors[0]} 45%, ${choice.colors[1]} 45% 72%, ${choice.colors[2]} 72%)`;
    options.forEach((option) => {
      const selected = option.dataset.theme === theme;
      option.setAttribute('aria-selected', String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  try { localStorage.setItem('qyrex.site.theme', theme); } catch { /* Preferência só nesta página. */ }
}
let savedTheme = 'onsen';
try { savedTheme = localStorage.getItem('qyrex.site.theme') || 'onsen'; } catch { /* Usa o padrão. */ }
applySiteTheme(savedTheme);

// Mascote compacta: o balão só aparece por escolha do visitante.
const buddy = document.querySelector('.buddy');
const buddyText = buddy.querySelector('[data-buddy-text]');
const buddyToggle = document.createElement('button');
buddyToggle.className = 'buddy-toggle';
buddyToggle.setAttribute('aria-label', 'Mostrar mensagem da capivara');
buddyToggle.setAttribute('aria-expanded', 'false');
buddyToggle.setAttribute('aria-controls', 'buddy-panel');
buddyToggle.append(buddy.querySelector('img'));
const buddyPanel = document.createElement('div');
buddyPanel.className = 'buddy-panel';
buddyPanel.id = 'buddy-panel';
buddyPanel.hidden = true;
buddyPanel.append(buddyText, buddy.querySelector('[data-buddy-close]'));
buddy.append(buddyToggle, buddyPanel);
function closeBuddyPanel() {
  buddyPanel.hidden = true;
  buddyToggle.setAttribute('aria-expanded', 'false');
}
buddyToggle.addEventListener('click', () => {
  const expanded = buddyToggle.getAttribute('aria-expanded') !== 'true';
  buddyToggle.setAttribute('aria-expanded', String(expanded));
  buddyPanel.hidden = !expanded;
});
document.addEventListener('pointerdown', (event) => {
  if (!buddy.contains(event.target)) closeBuddyPanel();
});
buddy.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeBuddyPanel(); buddyToggle.focus(); }
});
let phrase = 'Um projeto de cada vez.';
let idle;
function wake() {
  if (document.hidden || buddy.hidden) return;
  if (buddy.classList.contains('sleeping')) {
    buddy.classList.remove('sleeping'); buddyText.textContent = phrase;
  }
  if (idle) return;
  idle = setTimeout(() => {
    idle = null;
    buddy.classList.add('sleeping'); buddyText.textContent = 'Pausa para respirar. Zzz…';
  }, 30000);
}
// Reinicia o prazo sem agendar trabalho a cada movimento do ponteiro.
let lastActivity = Date.now();
const activity = () => {
  const now = Date.now();
  if (now - lastActivity > 1000 || buddy.classList.contains('sleeping')) {
    clearTimeout(idle); idle = null; lastActivity = now; wake();
  }
};
document.addEventListener('pointermove', activity, { passive: true });
document.addEventListener('keydown', activity);
buddy.addEventListener('pointerenter', () => { activity(); buddyText.textContent = 'Pronta para mais um commit?'; });
buddy.addEventListener('pointerleave', () => { buddyText.textContent = phrase; });
buddy.querySelector('[data-buddy-close]').addEventListener('click', () => {
  buddy.hidden = true; clearTimeout(idle); document.body.classList.add('buddy-closed');
  document.querySelector('.brand').focus({ preventScroll: true });
});
document.addEventListener('visibilitychange', () => {
  root.classList.toggle('paused', document.hidden);
  clearTimeout(idle); idle = null;
  if (!document.hidden) wake();
});
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    phrase = entry.target.dataset.buddy;
    if (!buddy.classList.contains('sleeping')) buddyText.textContent = phrase;
  }
}, { rootMargin: '-15% 0px -55% 0px' });
document.querySelectorAll('[data-buddy]').forEach((section) => observer.observe(section));
wake();
