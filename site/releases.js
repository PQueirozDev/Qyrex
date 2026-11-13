// O Markdown remoto nunca entra como HTML: primeiro escapamos toda a entrada.
function releaseMarkdown(value) {
  const escaped = String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const inline = (line) => line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  let list = '';
  let output = '';
  let fenced = false;
  const closeList = () => { if (list) { output += `</${list}>`; list = ''; } };
  for (const line of escaped.split(/\r?\n/)) {
    if (/^```/.test(line)) { closeList(); output += fenced ? '</code></pre>' : '<pre><code>'; fenced = !fenced; continue; }
    if (fenced) { output += line + '\n'; continue; }
    const item = line.match(/^\s*(?:([-*+])|\d+\.)\s+(.+)/);
    if (item) {
      const type = item[1] ? 'ul' : 'ol';
      if (list !== type) { closeList(); list = type; output += `<${list}>`; }
      output += `<li>${inline(item[2])}</li>`; continue;
    }
    closeList();
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) { const level = Math.min(6, heading[1].length + 2); output += `<h${level}>${inline(heading[2])}</h${level}>`; }
    else if (line.trim()) output += `<p>${inline(line)}</p>`;
  }
  closeList();
  if (fenced) output += '</code></pre>';
  return output;
}
const releaseDate = (date) => {
  const parsed = new Date(date);
  return date && Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null;
};
async function getReleases(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error('Release indisponível');
    return await response.json();
  } finally { clearTimeout(timeout); }
}
const releaseStatus = document.querySelector('[data-release-status]');
if (releaseStatus) {
  getReleases(LINKS.latestApi).then((release) => {
    if (!release || typeof release.tag_name !== 'string') throw new Error('Release inválida');
    document.querySelector('[data-release-version]').textContent = release.tag_name;
    const date = releaseDate(release.published_at);
    if (date) document.querySelector('[data-release-date]').textContent = date;
    const asset = Array.isArray(release.assets) && release.assets.find((a) => a.name === 'Qyrex-Setup.exe');
    if (asset && Number.isFinite(asset.size) && asset.size > 0) {
      document.querySelector('[data-release-size]').textContent = `${(asset.size / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MiB`;
    }
    if (release.body) {
      // Primeiro bloco limitado por linhas, sem cortar HTML renderizado.
      document.querySelector('[data-release-notes]').innerHTML = releaseMarkdown(release.body.split(/\r?\n/).slice(0, 18).join('\n'));
    }
    releaseStatus.textContent = 'Dados consultados na release oficial do GitHub.';
  }).catch(() => { releaseStatus.textContent = 'Não foi possível consultar a API. Para os dados atuais, veja na página de releases abaixo.'; });
}
const changelog = document.querySelector('[data-changelog]');
if (changelog) {
  const status = document.querySelector('[data-changelog-status]');
  getReleases(LINKS.latestApi.replace('/latest', '?per_page=30')).then((releases) => {
    if (!Array.isArray(releases) || !releases.length) throw new Error('Histórico indisponível');
    const fragment = document.createDocumentFragment();
    for (const release of releases) {
      const article = document.createElement('article'); article.className = 'release-entry';
      const title = document.createElement('h2'); title.textContent = release.name || release.tag_name || 'Release';
      const date = document.createElement('p'); date.className = 'eyebrow'; date.textContent = releaseDate(release.published_at) || 'Data indisponível';
      const body = document.createElement('div'); body.innerHTML = releaseMarkdown(release.body || 'Notas não informadas nesta release.');
      article.append(date, title, body); fragment.append(article);
    }
    changelog.replaceChildren(fragment); status.textContent = `${releases.length} releases carregadas do GitHub.`;
  }).catch(() => { status.textContent = 'Não foi possível carregar o histórico. Veja na página de releases pelo link abaixo.'; });
}
