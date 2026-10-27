// Placeholder "agent screen" frames (1280x800 SVG) of a fictional practice app, one per
// computer-use step. Only for HUD development; the real cu-worker streams screenshots.
const STEP_LABELS = [
  "Desktop",
  "Praxis-App: Start",
  "Patienten",
  "Suche: Weber",
  "Akte Dr. Weber",
  "Neuer Termin",
  "Kalender 14.10.",
  "Grund: Erstgespräch",
  "Termin gespeichert",
];

export function renderFrame(step: number): string {
  const label = STEP_LABELS[Math.min(step, STEP_LABELS.length - 1)]!;
  const saved = step >= STEP_LABELS.length - 1;
  const rows = Array.from({ length: 6 }, (_, i) => {
    const y = 220 + i * 70;
    const hl = step >= 3 && i === 0;
    return `<rect x="240" y="${y}" width="760" height="56" rx="8" fill="${hl ? "#dbeafe" : "#fff"}" stroke="#e2e8f0"/>
      <text x="264" y="${y + 34}" font-size="18" fill="#0f172a">${hl ? "Dr. Anna Weber · 12.03.1978 · privat" : `Patient ${i + 1}`}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800" font-family="Inter, Helvetica, Arial, sans-serif">
  <rect width="1280" height="800" fill="#f1f5f9"/>
  <rect width="1280" height="40" fill="#1e293b"/>
  <text x="16" y="26" font-size="15" fill="#e2e8f0">PraxisPilot – ${label}</text>
  <rect y="40" width="210" height="760" fill="#0f766e"/>
  ${["Übersicht", "Patienten", "Kalender", "Abrechnung"].map((t, i) => `<text x="28" y="${110 + i * 70}" font-size="18" fill="#ecfeff">${t}</text>`).join("")}
  <rect x="240" y="110" width="560" height="44" rx="8" fill="#fff" stroke="#cbd5e1"/>
  <text x="256" y="139" font-size="17" fill="#64748b">${step >= 3 ? "Weber" : "Patient suchen…"}</text>
  <rect x="1030" y="118" width="150" height="44" rx="8" fill="#0d9488"/>
  <text x="1048" y="147" font-size="17" fill="#fff">Neuer Termin</text>
  ${rows}
  ${saved ? `<rect x="440" y="330" width="400" height="120" rx="12" fill="#ecfdf5" stroke="#10b981" stroke-width="2"/><text x="640" y="398" font-size="24" text-anchor="middle" fill="#065f46">✓ Termin gespeichert</text>` : ""}
  <text x="1264" y="790" font-size="12" text-anchor="end" fill="#94a3b8">mock frame ${step}</text>
</svg>`;
}
