export const $ = (id) => document.getElementById(id);
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export const euro = (value) => new Intl.NumberFormat('de-DE', {style:'currency', currency:'EUR', maximumFractionDigits:0}).format(value);
export const clock = (value) => new Intl.DateTimeFormat('de-DE', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/Berlin'}).format(new Date(value));
export const day = (value) => new Intl.DateTimeFormat('de-DE', {day:'2-digit', month:'2-digit', year:'numeric', timeZone:'Europe/Berlin'}).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
export async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === 'string' ? value.detail : 'Bitte Eingaben prüfen. Datum und Uhrzeit müssen gültig sein.');
  return value;
}
export function notice(message, error=false, success=false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
  $('notice').classList.toggle('success', success);
}
export function guarded(fn) {
  return async (...args) => {try {await fn(...args);} catch(error) {notice(error.message, true);}};
}
const today = new Intl.DateTimeFormat('de-DE', {weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'Europe/Berlin'}).format(new Date());
if ($('today')) $('today').textContent = today;
