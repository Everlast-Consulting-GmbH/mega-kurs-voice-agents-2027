# Computer-Use-Worker

Eigener uv-Workspace-Service, Python 3.12. Events ausschließlich aus `jarvis_contracts`.
`pixel` ist Standard: Haiku 5.5, `computer_toolset_20260801`, normale Messages API ohne
Beta-Header. Alle 17 Mitglieder implementiert; Batch-Aktionen laufen sequenziell.
Nach Fehlern werden spätere Aktionen mit Anthropic-Halttext beantwortet. Maximal 24
Modellrunden / 160 Aktionen / 90 Sekunden pro Task. Kein zusätzlicher Planer.

## Start

Im Repo-Root (Docker Compose v2 mit optionalen env_file-Einträgen):

```sh
docker compose up --build -d cu-worker
curl http://localhost:8800/health
```

API `:8800`, noVNC `http://localhost:6080/vnc.html?autoconnect=1&resize=scale`.
Xvfb 1280×800, Openbox, Chromium-Kiosk, xdotool, xclip (Unicode-Zwischenablage),
x11vnc, noVNC und FastAPI laufen unter Supervisor als unprivilegierter Benutzer.
Chromiums Sandbox ist ausschließlich innerhalb dieses Demo-Containers deaktiviert.
CDP und VNC sind intern; veröffentlichte Ports binden an Loopback.

`PRAXIS_URL` standardmäßig `http://host.docker.internal:8700/praxis`,
`ORCHESTRATOR_URL=http://host.docker.internal:8787`.
`CU_PUBLIC_URL` und `CU_VNC_URL` müssen vom HUD-Browser erreichbar sein.
Bei Compose-Netzwerkadressen optional `PRAXIS_URL=http://mock-world:8700/praxis` und
`ORCHESTRATOR_URL=http://orchestrator:8787` setzen.
Compose übernimmt Keys aus `JARVIS_ENV_FILE` oder der `.env` im Repo-Root.
Python lädt denselben Pfad via dotenv (vorhandene Env-Werte gewinnen).
Fehlender Key verhindert nur Pixel-Läufe; Assisted benötigt keinen Key.

Ohne Compose-Plugin:

```sh
docker build -f services/cu-worker/Dockerfile -t jarvis-cu-worker:local .
docker run --rm --name jarvis-cu-worker --shm-size=512m \
  -p 127.0.0.1:8800:8800 -p 127.0.0.1:6080:6080 \
  --add-host host.docker.internal:host-gateway \
  jarvis-cu-worker:local
```

Für echte Pixel-Läufe zusätzlich `--env-file "$JARVIS_ENV_FILE"` an `docker run`
übergeben. Niemals Keys in Befehle oder Image einbetten.

## Schnittstellen und Verhalten

```sh
curl -X POST http://localhost:8800/tasks -H 'Content-Type: application/json' \
  -d '{"taskId":"demo-001","sessionId":"demo","instruction":"Trage Dr. Anna Weber für nächsten Dienstag 10:00 mit Grund Erstgespräch ein","mode":"assisted"}'
curl http://localhost:8800/tasks/demo-001
curl -X POST http://localhost:8800/tasks/demo-001/cancel
```

POST antwortet 202; GET liefert `status` (`running|done|failed|cancelled`), `steps`,
`durationMs` und bei Fehler `error`. Ein Desktop verarbeitet genau eine Aufgabe;
weitere erhalten 409. Gleiche ID + gleicher Body ist während desselben Prozesses
idempotent; abweichender Body oder nach Neustart bereits gespeicherte Frames → 409.
Zum Umschalten eine laufende Aufgabe abbrechen, dann neue ID mit `mode=assisted`.
Kein stiller automatischer Moduswechsel.

Pro Aktion: `cu.action` vor Ausführung, dann tatsächlicher Screenshot als `cu.frame`
und `task.progress`. Initialer Frame und Abschlussframe ebenfalls sichtbar.
Pixel-Zielrahmen sind Schätzungen um den Cursor; Assisted liefert echte DOM-Boxen.
PNG-Frames sind atomar gespeichert und unter `/frames/{taskId}/{n}.png` abrufbar.
Die bekannte Praxis-Startseite wird pro Task über CDP geöffnet. Im Pixel-Modus dient
CDP ausschließlich dieser Vorbereitung; danach laufen alle Aktionen über X11,
Screenshots kommen vom gesamten Desktop. Assisted arbeitet auf demselben sichtbaren
Browser, inklusive weich bewegtem X11-Cursor. Pixel hat bewusst keine erfundene
Gesamtschrittzahl; Assisted hat acht Schritte.

Assisted ist absichtlich auf den Referenzauftrag begrenzt und lehnt andere oder
zusätzliche Aufgaben ab. Selektoren passen zu PraxisPilot: Navigation „Patienten &
Termine“, „Patienten suchen“, Patient Anna Weber, „＋ Neuer Termin“, Datum-Feld,
Slot-Button „10:00 Uhr“, Grund, Speichern. Die Datumsauswahl wartet auf die Slots-API.
Für erkannte Referenzaufträge bestätigt der Worker in **beiden Modi** über die
Praxis-API einen neuen, aktiven Termin für P-001 zur gewünschten Zeit. Generische
Pixel-Aufträge verlangen einen expliziten Modellabschluss (`ok` + `summary`); sie
haben keinen unabhängigen fachlichen Oracle. Der Benchmark prüft zusätzlich A-101.

Event-Outbox unter `/data/outbox`: validiertes JSON, geordnete Lieferung per POST
`/events`, Backoff bis 5 s, Wiederholung nach Verbindungsfehler oder Neustart.
Lieferung ist at-least-once; Orchestrator sollte anhand `event.id` deduplizieren.
`/health` meldet `pendingEvents`, `eventDeliveryDegraded`, `pixelConfigured`.
Bei unerreichbarem Orchestrator bleiben Events erhalten; Echtzeit-HUD setzt seine
Erreichbarkeit voraus. Compose persistiert Frames/Outbox nach
`services/cu-worker/artifacts/runtime`. Tasks selbst sind nur im RAM; Container-
Absturz stellt keine laufende Aufgabe wieder her. Artefakte bei Bedarf nach der Demo
manuell bereinigen, nicht während laufender Tasks.

## Tests und Benchmark

Im Repo-Root: `uv sync --all-packages`, dann `uv run --all-packages pytest -q services/cu-worker`
(oder einfach `make test`). Isoliert, ohne den Root-Workspace:

```sh
uv venv services/cu-worker/.venv --python 3.12
uv pip install --python services/cu-worker/.venv/bin/python \
  -c services/cu-worker/requirements.lock \
  -e packages/contracts/python -e services/cu-worker pytest pytest-asyncio
services/cu-worker/.venv/bin/pytest services/cu-worker/tests -q
```

Realer Desktop-Smoke, ohne Modellkosten, nach dem Containerstart:

```sh
docker exec -d jarvis-cu-worker uvicorn fixture_app:app \
  --app-dir /app/services/cu-worker/tests --host 127.0.0.1 --port 8701
docker exec -e CU_DESKTOP_TEST=1 jarvis-cu-worker \
  python -m pytest /app/services/cu-worker/tests -q -p no:cacheprovider
```

Die minimale Testseite liegt in `tests/praxis.html`; `fixture_app.py` bietet nur die
benötigten REST-Endpunkte. Pixel-Smoke nutzt echte Maus/Tastatur, aber gemockte
Anthropic-Antworten; der echte SDK-Wire-Vertrag wird separat getestet.
Die Desktop-Tests benötigen exklusiven Zugriff auf den Bildschirm.
Live-Test zusätzlich mit `CU_LIVE_TEST=1` und Key; sonst automatisch übersprungen.

Echter Referenzbenchmark (setzt **vor jedem Lauf die gesamte Testwelt zurück**):

```sh
services/cu-worker/.venv/bin/python services/cu-worker/scripts/benchmark.py
# Ohne Key ist nur Assisted messbar:
services/cu-worker/.venv/bin/python services/cu-worker/scripts/benchmark.py --modes assisted
```

Standard 10× Pixel + 10× Assisted; Flags `--worker`, `--world`, `--runs`, `--output`.
Erfolg = Worker done + neuer aktiver P-001-Termin am nächsten Dienstag um 10:00,
Grund Erstgespräch, ID A-101. Dauer wird vom HTTP-Client inklusive Übergabe gemessen.
JSON-Artefakt und Markdown-Tabelle mit Median/Maximum. Reale Pixel-Zuverlässigkeit
ist erst durch diesen Benchmark nachgewiesen, nicht durch gemockte Tests.

## Referenzen

Vor Implementierung am 09.10.2026 geprüft:
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
- https://github.com/anthropics/claude-quickstarts/tree/main/computer-use-demo

Neue Toolsets akzeptieren keine alten display_width_px/name-Parameter.
Alle Tool-Resultate müssen toolset_name spiegeln; fehlende Resultate eines Batches
führen zum API-Fehler. Browser im Kiosk hat keine über Ctrl+L nutzbare Adressleiste.
xclip daemonisiert; dessen stdout/stderr müssen geschlossen sein, sonst hängt ein
Subprocess-communicate bis zum Timeout. Beide Fallen wurden im Container geprüft.
