import {$, esc, api, day, notice, guarded} from './shared.js';
let folder = 'inbox', unread = false, selectedId = null, current = null, loadRevision = 0, viewRevision = 0;
async function load() {
  const revision = ++loadRevision;
  const messages = await api(`/api/emails?folder=${folder}&unreadOnly=${unread}&limit=1000`);
  if (revision !== loadRevision) return;
  $('mail-count').textContent = messages.length;
  $('mail-summary').textContent = `${messages.filter(x => x.unread).length} ungelesen · ${messages.filter(x => x.unread && x.priority === 'high').length} dringend · Zeit für das Wesentliche.`;
  $('folder-title').textContent = folder === 'inbox' ? 'Posteingang' : 'Gesendet';
  $('mail-list').innerHTML = messages.map(mail => `<button class="mail-item ${mail.unread ? 'unread' : ''} ${mail.id === selectedId ? 'selected' : ''}" data-id="${esc(mail.id)}"><span class="sender"><span>${esc(folder === 'sent' ? mail.to : mail.fromName)}</span><time>${day(mail.receivedAt)}</time></span><span class="subject">${esc(mail.subject)}</span><span class="snippet">${mail.priority === 'high' ? '<span class="badge high">Dringend</span> ' : ''}${esc(mail.body.slice(0, 65))}</span></button>`).join('') || '<div class="empty">Hier sind keine Nachrichten.</div>';
  for (const button of $('mail-list').querySelectorAll('button')) button.onclick = guarded(() => openMail(button.dataset.id));
}
async function openMail(id) {
  const revision = ++viewRevision;
  const mail = await api(`/api/emails/${encodeURIComponent(id)}`);
  if (revision !== viewRevision) return;
  current = mail; selectedId = id;
  $('compose-form').hidden = true; $('message').hidden = false;
  $('message').innerHTML = `<div class="eyebrow">${esc(mail.id)} · ${day(mail.receivedAt)}</div><h2 class="detail-title">${esc(mail.subject)}</h2><p><strong>${esc(mail.fromName)}</strong> <span class="muted">&lt;${esc(mail.from)}&gt;</span></p><p class="muted">An: ${esc(mail.to)}</p><div class="mail-body">${esc(mail.body)}</div><div class="form-footer"><span class="badge ok">Gelesen</span><button id="reply">Antworten</button></div>`;
  $('reply').onclick = () => compose(true);
  await load();
}
function compose(reply=false) {
  ++viewRevision;
  $('message').hidden = true; $('compose-form').hidden = false;
  $('to').value = reply && current ? (current.folder === 'sent' ? current.to : current.from) : '';
  $('subject').value = reply && current ? `Re: ${current.subject}` : '';
  $('body').value = '';
  notice('Die Nachricht bleibt ausschließlich in dieser Testwelt.');
  $(reply ? 'body' : 'to').focus();
}
for (const name of ['inbox', 'sent']) $(name).onclick = guarded(async () => {
  ++viewRevision;
  folder = name;
  for (const item of ['inbox', 'sent']) $(item).classList.toggle('active', item === name);
  await load();
});
$('unread').onclick = guarded(async () => {unread = !unread; $('unread').classList.toggle('active', unread); $('unread').setAttribute('aria-pressed', String(unread)); await load();});
$('compose').onclick = () => compose();
$('compose-form').onsubmit = guarded(async event => {
  event.preventDefault(); $('send').disabled = true;
  try {
    const mail = await api('/api/emails', {to:$('to').value, subject:$('subject').value, body:$('body').value});
    folder = 'sent'; unread = false;
    $('sent').classList.add('active'); $('inbox').classList.remove('active');
    $('unread').classList.remove('active'); $('unread').setAttribute('aria-pressed', 'false');
    await openMail(mail.id);
    notice(`Nachricht gesendet · ${mail.id} · Im Ordner „Gesendet“ gespeichert.`);
  } finally {$('send').disabled = false;}
});
guarded(load)();
