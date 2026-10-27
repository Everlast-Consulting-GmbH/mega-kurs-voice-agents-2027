# Jarvis Orchestrator

FastAPI-Gateway für alle 18 Contract-Tools, Streamable-HTTP-MCP, WebSocket-Event-Hub
und delegierte Aufgaben mit Claude (Standard: Haiku 5.5). Ein Prozess, Port 8787.

## Start

Im Repository-Root:

```bash
uv sync --package jarvis-orchestrator --extra dev
uv run --package jarvis-orchestrator jarvis-orchestrator
```

Alternativ Docker:

```bash
docker compose up --build orchestrator
```

Der Service funktioniert ohne API-Key für alle Fähigkeiten außer `delegate_task`.
Mock-World und CU-Worker müssen für ihre jeweiligen Tools erreichbar sein. Für `place_call`
ist kein Telefonie-Dienst enthalten (siehe unten).

Konfiguration: Prozess-Environment hat Vorrang. `JARVIS_ENV_FILE` lädt eine explizite
`.env`; sonst die `.env` im Hauptverzeichnis des Repos.

| Variable | Standard |
|---|---|
| `MOCK_WORLD_URL` | `http://localhost:8700` |
| `CU_WORKER_URL` | `http://localhost:8800` |
| `VOICE_AGENT_URL` | `http://localhost:8900` (eigener Telefonie-Dienst, nicht enthalten) |
| `ORCHESTRATOR_MODEL` | `claude-haiku-5-5` |
| `REQUESTY_API_KEY` | leer; wenn gesetzt, laufen Claude-Aufrufe über Requesty |
| `ANTHROPIC_API_KEY` | leer; Fallback ohne Requesty. Fehlen beide, meldet Delegation `task.failed` |
| `PORT` | 8787 aus Contracts |
| `JARVIS_CONTRACTS_DIR` | `packages/contracts` im Checkout; im Docker-Image explizit gesetzt |

## Schnittstellen

- `GET /health` → `{ok:true}`.
- `GET /tools` → Metadaten und vollständige Input-Schemas aus Contracts.
- `POST /tools/{name}?sessionId=demo` → `ToolResult`.
- `WS /events?sessionId=demo` → validierte JarvisEvents dieser Session.
  Eingehend ist nur `approval.resolved` derselben Session erlaubt.
- `POST /events` → validierter Ingest für CU-Worker und andere Dienste, Status 202;
  ungültige Events oder unbekannte Freigaben → 422.
- `/mcp?sessionId=demo` → offizielles MCP-SDK, Streamable HTTP, identischer
  Katalog und dieselbe Gateway-Ausführung. Kein separater Tool-Code für MCP.

HTTP-Tool-Validierungsfehler → 422, unbekannte Tools → 404; ausgeführte, aber
fehlgeschlagene Tools liefern HTTP 200 mit `{ok:false,error:...}`. Asynchrone Tools
liefern sofort `{ok:true,result:{taskId}}`. Ihre späteren Fehler stehen in `task.failed`.
Ein `tool.finished` bei diesen Tools bestätigt die Annahme, nicht den Task-Abschluss.

Tools:

| Synchron | Asynchron |
|---|---|
| `get_briefing`, `list_leads`, `get_lead` | `delegate_task` |
| `list_emails`, `read_email`, `list_events` | `start_computer_task` |
| `focus_entity`, `render_widget`, `create_event` | `send_email` |
| `resolve_approval`, `reply_email` | `place_call` |
| `post_message`, `move_deal` | `handle_request` (Agenten-Lauf mit Plan und Freigabe) |

```bash
curl -s http://localhost:8787/tools
curl -s -X POST http://localhost:8787/tools/get_briefing \
  -H 'Content-Type: application/json' -d '{}'
curl -s -X POST http://localhost:8787/tools/delegate_task \
  -H 'Content-Type: application/json' \
  -d '{"instruction":"Fasse die drei wichtigsten Leads zusammen"}'
```

## Ablauf und Grenzen

- Alle Daten-Tools validieren die Domain-Antworten mit den generierten Pydantic-Modellen.
  Inputs kommen aus `tool-inputs.schema.json`. Metadaten und Ports werden direkt aus
  den einfachen TS-Objektliteralen `TOOL_META` und `PORTS` gelesen (JSON5, kein Eval).
  Unterschiedliche Tool-Namen in Schema und Metadaten verhindern den Start.
  Bei einer Änderung der TS-Literalform muss der kleine Reader angepasst werden.
- `get_briefing` liefert sofort die Mock-World-Daten. Ein Hintergrundjob spielt
  `briefing.item` mit rund 1,2 Sekunden Abstand. Fokus-IDs für Lead/Mail/Termin werden
  aus aktuellen Mock-World-Daten gelesen, weil BriefingItem keine Entity-ID enthält.
- Claude nutzt den Agent SDK mit In-Process-MCP und ausschließlich schnellen Tools;
  `resolve_approval` bleibt menschlichen Nutzern vorbehalten. Eingebaute Claude-Code-
  Tools, Projektsettings und fremde MCP-Server sind deaktiviert. Grenzen: 12 Turns,
  120 Sekunden, 2 USD pro Delegation. Tool-Aufrufe erzeugen nummerierte Fortschritte.
- `send_email` registriert die Freigabe vor dem Request-Event. Freigabe per WS,
  Event-Ingest oder `resolve_approval`; Ablehnung oder 120 Sekunden ohne Freigabe
  verhindern den Versand. Wiederholte gleiche Auflösungen lösen keinen zweiten Versand aus.
- Computer Use: Task-ID und Session gehen unverändert an `POST :8800/tasks`.
  Der Worker besitzt die regulären Terminalevents. Nach spätestens 90 Sekunden
  beginnt Abbruch mit `POST /tasks/{id}/cancel` (maximal 2 Sekunden zusätzliche
  Cancel-Wartezeit). Späte Worker-Events werden verworfen. Ein bereits erhaltenes
  Terminalevent gewinnt gegen eine anschließend verlorene Dispatch-Antwort.
- `place_call` sendet `{to,purpose,context:{sessionId,taskId}}` an `POST $VOICE_AGENT_URL/calls`.
  Ein solcher Telefonie-Dienst ist in diesem Repo **nicht enthalten**; ohne ihn endet
  `place_call` mit `task.failed`. Wer einen baut, meldet den Anrufverlauf als `call.state`
  per `POST /events`.
- Event- und Freigabezustand sind ausschließlich im Speicher. Kein Replay nach
  Neustart, keine Persistenz, keine mehreren Uvicorn-Worker. Langsame WS-Clients
  werden mit Code 1013 getrennt, ohne schnelle Tools zu blockieren.
- Lokalbetrieb ohne Authentifizierung; der Compose-Port ist an Loopback gebunden.
  MCP ist für weitere lokale Clients vorbereitet. Für öffentliches Hosting brauchst du
  zusätzlich einen Zugangsschutz.

## Verifikation

```bash
uv run --package jarvis-orchestrator --extra dev pytest services/orchestrator/tests -q
uv run --package jarvis-orchestrator --extra dev pytest services/orchestrator/tests/test_network.py -q -s
uv run --package jarvis-orchestrator --extra dev ruff check --config services/orchestrator/pyproject.toml services/orchestrator
```

Tests mocken Mock-World, CU-Worker, den Telefonie-Endpunkt und den Claude-SDK-Client. Der
Netzwerk-Smoke startet Uvicorn auf einem freien Loopback-Port und prüft echte
HTTP-/WS-Verbindungen sowie Initialisierung, Listing und Aufruf über den offiziellen
MCP-Client. Der Latenzcheck verwendet gemockte Mock-World-Antworten, keine Aussage
über die spätere End-to-End-Latenz.

`test_live.py` wird ohne Key übersprungen; mit Key und laufender Mock-World testet es
„Fasse die drei wichtigsten Leads zusammen“ bis `task.done` und verursacht API-Kosten.
Der Root-`make test` führt diese Suite zusammen mit allen anderen aus.

Gelesene SDK-Quellen: [Claude Agent SDK Python](https://platform.claude.com/docs/en/agent-sdk/python),
[MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk),
[MCP 1.x](https://py.sdk.modelcontextprotocol.io/v1/).
Getestet mit `claude-agent-sdk 0.2.165`, `mcp 1.30.0`, Python 3.12.
MCP ist auf die weiterhin unterstützte 1.x-Linie begrenzt; das verhindert eine
unbeabsichtigte Migration der Transport- und Modell-APIs auf 2.x.
