import {$, esc, api, clock, day, notice, guarded} from './shared.js';
let context, patients = [], selectedPatient = null, selectedStart = null, editing = false;
let slotRevision = 0, searchRevision = 0;
const patientName = patient => `${patient.firstName} ${patient.lastName}`;

async function search() {
  const revision = ++searchRevision;
  const results = await api(`/praxis/api/patients?q=${encodeURIComponent($('patient-search').value)}`);
  if (revision !== searchRevision) return;
  $('patient-count').textContent = `${results.length} ${results.length === 1 ? 'Patient' : 'Patienten'}`;
  $('patients').innerHTML = results.map(patient => `<button class="patient-button ${selectedPatient?.id === patient.id ? 'selected' : ''}" data-patient="${esc(patient.id)}" aria-pressed="${selectedPatient?.id === patient.id}"><span class="avatar">${esc(patient.lastName[0])}</span><span><strong>${esc(patientName(patient))}</strong><small>${esc(patient.id)} · ${day(patient.birthDate)} · ${esc(patient.insurance)}</small></span></button>`).join('') || '<div class="empty">Keine Patienten gefunden.</div>';
  for (const button of $('patients').querySelectorAll('button')) button.onclick = () => {
    selectedPatient = results.find(patient => patient.id === button.dataset.patient);
    $('selected-patient').textContent = `${patientName(selectedPatient)} · ${selectedPatient.insurance} · ${selectedPatient.id}`;
    for (const row of $('patients').querySelectorAll('button')) {
      row.classList.toggle('selected', row === button);
      row.setAttribute('aria-pressed', String(row === button));
    }
    notice(editing ? 'Patient ausgewählt. Bitte Termin vervollständigen.' : 'Patient ausgewählt. Mit „Neuer Termin“ fortfahren.');
  };
}

function resetDay() {
  selectedStart = null;
  $('booking-summary').textContent = 'Bitte eine Uhrzeit auswählen.';
}

// keepView: after saving, the booked day stays on screen until it is reloaded, so the final CU frame
// shows a complete layout. A date change still clears first, so no stale slot can be clicked.
async function refreshDay({keepView = false} = {}) {
  const date = $('appointment-date').value;
  const revision = ++slotRevision;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!keepView || !valid) {
    resetDay();
    $('slots').innerHTML = '';
    $('appointments').innerHTML = '';
  }
  if (!valid) throw new Error('Bitte das Datum als JJJJ-MM-TT eingeben.');
  const [slots, appointments] = await Promise.all([
    api(`/praxis/api/slots?date=${encodeURIComponent(date)}`),
    api(`/praxis/api/appointments?date=${encodeURIComponent(date)}`),
  ]);
  if (revision !== slotRevision) return;
  resetDay();
  $('slots').innerHTML = slots.map(slot => `<button type="button" class="slot" data-start="${esc(slot.start)}" aria-pressed="false" aria-label="${clock(slot.start)} Uhr${slot.free ? '' : ' belegt'}" ${slot.free ? '' : 'disabled'}>${clock(slot.start)}</button>`).join('');
  for (const button of $('slots').querySelectorAll('button')) button.onclick = () => {
    selectedStart = button.dataset.start;
    for (const slot of $('slots').querySelectorAll('button')) {
      slot.classList.toggle('selected', slot === button);
      slot.setAttribute('aria-pressed', String(slot === button));
    }
    $('booking-summary').textContent = `${day(selectedStart)} · ${clock(selectedStart)} Uhr · 30 Min.`;
  };
  $('appointments-date').textContent = day(date);
  $('appointments').innerHTML = appointments.map(appointment => {
    const patient = patients.find(patient => patient.id === appointment.patientId);
    return `<tr><td><strong>${clock(appointment.start)}</strong></td><td>${esc(patient ? patientName(patient) : appointment.patientId)}</td><td>${esc(appointment.reason)}</td><td><span class="badge ${appointment.status === 'bestaetigt' ? 'ok' : ''}">${appointment.status === 'bestaetigt' ? 'Bestätigt' : esc(appointment.status)}</span></td><td>${esc(appointment.id)}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">Für diesen Tag sind noch keine Termine eingetragen.</td></tr>';
}

$('search-form').onsubmit = guarded(async event => {event.preventDefault(); await search();});
$('patient-search').oninput = guarded(search);
$('new-appointment').onclick = () => {
  if (!selectedPatient) {notice('Bitte zuerst einen Patienten auswählen.', true); $('patient-search').focus(); return;}
  editing = true;
  $('booking-fields').disabled = false;
  $('reason').value = '';
  selectedStart = null;
  for (const slot of $('slots').querySelectorAll('button')) {slot.classList.remove('selected'); slot.setAttribute('aria-pressed', 'false');}
  $('booking-summary').textContent = 'Bitte eine Uhrzeit auswählen.';
  notice('Datum und Uhrzeit auswählen, Grund eintragen und Termin speichern.');
  $('appointment-date').focus();
};
$('appointment-date').onchange = guarded(() => refreshDay());
$('next-tuesday').onclick = guarded(async () => {$('appointment-date').value = context.nextTuesday; await refreshDay();});
$('booking-form').onsubmit = guarded(async event => {
  event.preventDefault();
  if (!selectedPatient || !selectedStart) {notice('Bitte Patient und freie Uhrzeit auswählen.', true); return;}
  if (selectedStart.slice(0, 10) !== $('appointment-date').value) {notice('Bitte eine Uhrzeit für das gewählte Datum auswählen.', true); return;}
  $('save-appointment').disabled = true;
  try {
    const appointment = await api('/praxis/api/appointments', {patientId:selectedPatient.id,
      practitioner:context.practitioner, start:selectedStart, durationMin:30, reason:$('reason').value});
    editing = false;
    $('booking-fields').disabled = true;
    // Confirm before reloading the day: the reload gives Chromium time to paint before CU grabs its final frame.
    const confirmed = `Bestätigt · ${day(appointment.start)} · ${clock(appointment.start)} Uhr · 30 Min.`;
    notice(`Termin gespeichert · ${appointment.id} · ${patientName(selectedPatient)} · ${day(appointment.start)}, ${clock(appointment.start)} Uhr · ${appointment.reason}`, false, true);
    $('booking-summary').textContent = confirmed;
    await refreshDay({keepView: true});
    $('booking-summary').textContent = confirmed;
  } finally {$('save-appointment').disabled = false;}
});

guarded(async () => {
  [context, patients] = await Promise.all([api('/praxis/api/context'), api('/praxis/api/patients')]);
  $('appointment-date').value = context.nextTuesday;
  $('practitioner').textContent = context.practitioner;
  await Promise.all([search(), refreshDay()]);
})();
