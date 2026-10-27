import {$, esc, api, euro, day, guarded} from './shared.js';
let leads = [], selectedId = 'L-007', detailRevision = 0;
const tones = {qualifiziert:'blue', angebot:'blue', verhandlung:'high', gewonnen:'ok'};
const labels = {neu:'Neu', qualifiziert:'Qualifiziert', angebot:'Angebot', verhandlung:'Verhandlung', gewonnen:'Gewonnen', verloren:'Verloren'};
function render() {
  const query = $('lead-search').value.toLocaleLowerCase('de-DE');
  const filtered = leads.filter(lead => (!$('status-filter').value || lead.status === $('status-filter').value) && `${lead.name} ${lead.company} ${lead.city}`.toLocaleLowerCase('de-DE').includes(query));
  $('lead-count').textContent = `${filtered.length} Leads`;
  $('leads').innerHTML = filtered.map(lead => `<tr class="${lead.id === selectedId ? 'selected' : ''}"><td><button class="row-button" data-id="${esc(lead.id)}"><strong>${esc(lead.name)}</strong><span class="muted">${esc(lead.company)}</span></button></td><td><span class="badge ${tones[lead.status] ?? ''}">${labels[lead.status]}</span></td><td>${euro(lead.valueEur)}</td><td><strong>${lead.score}</strong></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Keine Kontakte gefunden.</td></tr>';
  for (const button of $('leads').querySelectorAll('button')) button.onclick = guarded(() => detail(button.dataset.id));
}
async function detail(id) {
  const revision = ++detailRevision;
  const lead = await api(`/api/leads/${encodeURIComponent(id)}`);
  if (revision !== detailRevision) return;
  selectedId = id;
  $('lead-detail').innerHTML = `<div class="lead-hero"><span class="avatar">${esc(lead.name.split(' ').map(x => x[0]).slice(0,2).join(''))}</span><h2 class="detail-title">${esc(lead.name)}</h2><p class="muted">${esc(lead.company)} · ${esc(lead.city)}</p><div class="score"><span>Lead-Score</span><strong>${lead.score}<span class="muted"> / 100</span></strong></div><div class="score-line"><i style="width:${Number(lead.score)}%"></i></div></div><div class="panel-body"><span class="badge blue">${labels[lead.status]} · ${esc(lead.id)}</span><dl class="detail-grid"><div><dt>Potenzial</dt><dd><strong>${euro(lead.valueEur)}</strong></dd></div><div><dt>Nächster Schritt</dt><dd>${esc(lead.nextStep)}</dd></div><div><dt>E-Mail</dt><dd>${esc(lead.email)}</dd></div><div><dt>Telefon</dt><dd>${esc(lead.phone)}</dd></div><div><dt>Letzter Kontakt</dt><dd>${day(lead.lastContactAt)}</dd></div></dl><p class="muted">${esc(lead.notes)}</p></div>`;
  render();
}
$('lead-search').oninput = render;
$('status-filter').onchange = render;
guarded(async () => {
  leads = await api('/api/leads?limit=1000');
  const active = leads.filter(x => !['gewonnen','verloren'].includes(x.status));
  $('pipeline').textContent = euro(active.reduce((sum, x) => sum + x.valueEur, 0));
  $('active-count').textContent = active.length;
  $('top-score').textContent = leads[0]?.score ?? '–';
  $('top-company').textContent = leads[0]?.company ?? 'Keine Leads';
  render(); await detail(selectedId);
})();
