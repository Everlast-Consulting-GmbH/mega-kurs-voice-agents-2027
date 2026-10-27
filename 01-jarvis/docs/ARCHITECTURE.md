# Architektur

Wie das System tatsächlich läuft: lokaler Vollstack mit HUD, Orchestrator, Testwelt und
Computer-Use-Worker.

## Überblick

Ein Browser-HUD zeigt alles, was Jarvis tut. Gesprochen wird über einen ElevenLabs-Agenten,
dessen Tools im Browser laufen und das Tool-Gateway des Orchestrators aufrufen. Der
Orchestrator holt Daten aus der Mock-World, startet Computer Use im CU-Worker und verteilt
jedes Ereignis als `JarvisEvent` per WebSocket an das HUD.

## Komponenten

| Komponente | Aufgabe | Ort | Läuft |
|---|---|---|---|
| Contracts | Events, Tools, Domain-Modelle, Ports (Zod → JSON Schema → Pydantic) | `packages/contracts` | Bibliothek |
| HUD | Bildaufbau „Sprecher + Bühne“ mit Erklär-Leiste (Taste `D`), Voice-Session, Client-Tools | `apps/hud` | Host, Port 3000 |
| ElevenLabs-Agent | Persona, Stimme, LLM, Client-Tool-Definitionen als Code | `agents/jarvis` | ElevenLabs (global, optional EU-Residency) |
| Orchestrator | Tool-Gateway (HTTP + MCP), Event-Hub, Freigaben, Claude-Agent | `services/orchestrator` | Host oder Docker, 8787 |
| Mock-World | Testdaten + Web-UIs (Mail, CRM, Praxis-App) | `services/mock-world` | Host oder Docker, 8700 |
| CU-Worker | Computer Use in Linux-Desktop (Xvfb, Chromium, noVNC) | `services/cu-worker` | Docker, 8800 + 6080 |
| Mock-Events | Ersetzt den Orchestrator-Stream für HUD-Entwicklung | `tools/mock-events` | Host, 8787 |
| Demo-Driver | Ruft die Demo-Tools ohne Stimme auf (Proben, E2E) | `tools/demo_drive.py` | Host |


## Datenfluss

1. Du sprichst → ElevenLabs-Agent entscheidet → Client-Tool im Browser →
   `POST :8787/tools/{name}?sessionId=demo`.
2. Orchestrator sendet `tool.started`, führt aus (Mock-World-REST, CU-Worker, Claude),
   sendet `tool.finished` mit deutscher Zusammenfassung und gibt `ToolResult` zurück.
3. Schnelle Tools antworten synchron (gemessen 2 bis 12 ms lokal). Async Tools
   (`delegate_task`, `start_computer_task`, `send_email`, `place_call`) liefern sofort
   `{taskId}`; Fortschritt kommt als `task.*`-Events.
4. CU-Worker schickt `cu.mode`, `cu.frame`, `cu.action`, `task.*` per `POST :8787/events`
   (Outbox mit Retry); Frames liegen unter `:8800/frames/{taskId}/{n}.png`.
5. HUD empfängt alle Events über `ws://localhost:8787/events?sessionId=demo`.
   `ElevenLabsVoiceSession` gibt `task.done`/`task.failed`, `approval.requested` und `notice`
   sofort als contextual update an den Agenten (einmal pro taskId/approvalId/noticeId) und
   stößt an der nächsten sicheren Turn-Grenze per `sendUserMessage("HUD-Systemmeldung: …")`
   das Sprechen an: Jarvis still seit 600 ms, Mikrofon leise seit 800 ms, keine Antwort auf
   deine Frage oder einen früheren Anstoß ausstehend. Beim Verbinden geht das Sitzungsdatum als
   contextual update raus.
6. Freigaben: `send_email` erzeugt `approval.requested`; aufgelöst per HUD-Klick
   (Client-Event `approval.resolved` über WS) oder Tool `resolve_approval`.
7. Proaktive Unterbrechung: `POST :8787/demo/notice/urgent-mail` (Dev-Panel-Button,
   `tools/demo_drive.py notice`) legt über `POST :8700/admin/incoming-mail` eine neue Mail an
   und sendet `notice` (urgent) + `ui.focus`. Das HUD zeigt die Mitteilung, Jarvis wird mit
   der Bitte um höfliche Unterbrechung angestoßen.

## HUD-Bildaufbau

Verbindliche Vorlagen: `apps/hud/design/stage-layout-mockup.html` (Sprecher + Bühne) und
`apps/hud/design/agents-desktop-mockup.html` (Bild A bis C: Agenten in echten Programmen). Jarvis
(Kugel + ein großer Satz) ist der Sprecher, daneben gibt es genau eine Bühne.

- **Logik rein in `lib/stage.ts`:** `stageMode()` wählt den Aufbau: `calm`, `stage` (Panel),
  `cu` (Agent-Fenster), `call`, `agents` (Bild A), `summary` (Bild B), `desk` (Briefing als
  aufgefächerte App-Fenster, Bild C). `stageItem()` wählt den einen Inhalt nach Priorität
  Freigabe > Agenten-Lauf > Computer Use > Werkzeug gelernt > Widget > Briefing > Fokus. Ein
  Inhalt, den ein neuerer mit gleicher oder höherer Priorität ersetzt hat, kommt nicht zurück;
  nur offene Freigabe, laufender Computer Use und laufender Agenten-Lauf kehren zurück. Nach 12 s
  ohne neuen Bezug schließt die Bühne. Außerdem dort: Statuszeile, Erklär-Leiste, Widget-Aussage.
- **`notice` nimmt nie die Bühne:** Sie erscheint als macOS-artige Mitteilung oben rechts
  (`NoticeToast`); dringende färben Himmel und Kugel warm.
- **Agenten-Lauf (`lib/agents.ts`):** Der Reducer sammelt `run.planned`/`agent.*`/`run.summary`
  in `state.run`. Ein Plan mit `approvalId` legt selbst eine offene Freigabe an (die Plan-Karte
  beantwortet sie über die bestehende Freigabe-Logik). `schedule()` spielt die Aktionen pro
  Agent nacheinander ab, jede frühestens bei Eintreffen, mit Mindestdauern (Cursor-Weg, Tippen
  ~30 ms/Zeichen, Ziehen 1,1 s). Bild B erscheint erst, wenn `run.summary` da ist **und** alles
  abgespielt wurde. Was ein Fenster zeigt, rechnen reine Funktionen in `lib/apps/views.ts` aus
  Daten + abgespielten Aktionen aus; die Aktions-Konventionen pro App stehen dort im Kopf.
- **App-Fenster (`components/apps`):** Mail, Kalender, Slack, CRM als echte Oberflächen in
  einer gemeinsamen macOS-Hülle (`WindowShell`, auch fürs Computer-Use-Fenster). Cursor zielen
  auf Elemente mit `data-t="…"` im Fenster (`AgentCursor`). Ein Fenster rendert nur neu, wenn
  sich Sichtbares ändert (`usePlaybackNow`), so halten vier tippende Agenten 60 fps.
- **Datenschicht (`lib/apps/data.ts`):** Fenster zeigen Mock-World-Daten (`GET /api/emails`,
  `/api/events`, `/api/leads`, `/api/chat?channel=`), je Sammlung mit Fallback auf die
  Demo-Daten in `lib/apps/fixtures.ts` (gleiche IDs wie die Mock-Szenarien).
  `NEXT_PUBLIC_MOCK_WORLD_URL=off` erzwingt die Demo-Daten. Höchstens vier Agenten bekommen
  ein Fenster und einen Chip.
- **Regie-Tasten (`lib/regie.ts`):** `R` Reset, `N` Mitteilung, `M` Müller-Lauf, `C` Computer
  Use rufen die Probe-Endpunkte des Orchestrators (`tools/mock-events` beantwortet dieselben).
  Bestätigung nur in der Erklär-Leiste (`D`). Ton an/aus liegt deshalb auf `T`.
- **Widget-Überschrift** wird aus `data` berechnet (letzter Wert und Änderung zum Vormonat bzw.
  Spitzenreiter), nie erfunden. Euro nur für Pipeline-Titel und Karten (Mock-World-Datensätze).
- **Fokus-Bühne** zeigt nur, was im Gespräch schon vorkam (Briefing, Notices, Aufgabenergebnisse),
  es wird nichts nachgeladen.
- **Evidence:** `e2e/stage.spec.ts` (Sprecher + Bühne) und `e2e/agents.spec.ts` (Bild A bis C, Plan,
  Regie, Computer Use, `agents-metrics.json`, `agents-full-demo.mp4`) bauen das HUD, starten
  Mock-Events selbst und schreiben Screenshots nach `apps/hud/evidence/` (nicht versioniert).
- Store, Reducer und Voice-Session kennen keine Ansicht.

## Externe Abhängigkeiten

| Dienst | Wofür | Zugangsdaten | Wenn er fehlt |
|---|---|---|---|
| ElevenLabs | Stimme, Gesprächs-LLM | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, optional `ELEVENLABS_API_BASE` in Root-`.env` | HUD zeigt Fehler am Kern; Mock-Voice und Demo-Driver funktionieren weiter |
| Requesty | Claude für den Orchestrator (Haiku 5.5, `delegate_task`) | `REQUESTY_API_KEY` in Root-`.env` (alternativ `ANTHROPIC_API_KEY`) | `delegate_task` meldet `task.failed` |
| Anthropic direkt | CU-Worker im Pixel-Modus (Haiku 5.5, `computer_toolset_20260801`); Requesty reicht das Toolset nicht durch | `ANTHROPIC_API_KEY` in Root-`.env` | Pixel-Computer-Use meldet `task.failed`; `assisted` läuft ohne Key |
| Telefonie (nicht enthalten) | Ausgehender Anruf über einen eigenen Dienst hinter `VOICE_AGENT_URL` | keine | `place_call` endet mit `task.failed` |

## Fallen

- **null vs. fehlend:** Zod `.optional()` lehnt `null` ab, das HUD verwirft solche Events
  stillschweigend. Python-Events laufen deshalb über `make_event` (entfernt `None`) und den
  Hub (`exclude_none`). Neue Event-Quellen müssen denselben Weg nehmen.
- **Briefing-Index ist 0-basiert;** Index 0 startet im HUD ein neues Briefing.
- **Pytest über mehrere Services in einem Lauf** kollidiert an gleichnamigen Testmodulen;
  `make test` führt die Suites einzeln aus.
- **Ohne Docker-Compose-Plugin:** Container per `docker build/run` starten, so wie es
  `tools/demo.sh` macht.
- **Sprechanstoß ist eine Nutzernachricht:** Kontext allein bringt den ElevenLabs-Agenten
  nicht zum Reden. Der Anstoß beginnt mit `HUD-Systemmeldung:` und wird aus dem Transkript
  gefiltert; der Persona-Prompt muss ihn als „kein Auftrag, keine Freigabe“ behandeln.
- **Sprichst du gerade?** Erkannt am lokalen Mikrofonpegel. Server-VAD (`onVadScore`) ist
  verdrahtet, liefert aber erst, wenn `vad_score` in den `client_events` des Agenten steht.
- **Zustand-Selektoren müssen stabile Werte liefern:** Ein Selektor, der bei jedem Aufruf ein
  neues Objekt baut (z. B. `useHud((s) => subtitleLine(s, now))`), löst in React eine
  Endlosschleife aus („getSnapshot should be cached“). Stabilen Teil selektieren, Rest außerhalb
  berechnen oder auf einen String abbilden. `useShallow` hilft nur, wenn die Elemente selbst
  stabil sind: ein Array frisch gebauter Objekte (Chips, Fäden) schleift trotzdem.
- **Effekt-Kurzform gibt Werte als Cleanup zurück:** `useEffect(() => el.scrollTo(...))` bricht
  in aktuellem Chromium die Seite („destroy is not a function“), weil `scrollTo` dort ein
  Promise liefert. Effekte immer mit Block-Body schreiben.
- **WebGL-Kontext nicht im Cleanup verwerfen:** React-StrictMode mountet Effekte doppelt auf
  demselben Canvas; nach `loseContext()` kompiliert kein Shader mehr.
- **Evidence-Lauf neben laufendem Stack:** Auf 8787/3000 läuft oft schon ein anderer Stack. Mit
  `reuseExistingServer` hat Playwright früher dessen HUD statt des eigenen Builds fotografiert.
  `playwright.config.ts` nutzt deshalb eigene Ports (HUD 3100, Mock 8797, per `HUD_PORT`/
  `MOCK_PORT` änderbar). Der Build schreibt `.next`, ein Dev-Server im selben Ordner muss vorher aus.
- **Daten während eines Agenten-Laufs eingefroren:** Der Orchestrator schreibt schon in die
  Mock-World, während das HUD die Aktion noch abspielt. Ein Refetch mitten im Lauf zeigte das
  Ergebnis (Deal schon in „Verhandlung“) vor der Animation. Die Datenschicht friert daher ab
  dem ersten `agent.*` ein und lädt 12 s nach `run.summary` neu, spätestens 45 s nach dem
  letzten Agenten-Event (`appDataOnEvent` in `lib/apps/data.ts`).
- **Mock-Events überlebt die Testseite:** Ein Szenario, das ein Test per Regie-Taste startet,
  läuft auf dem gemeinsamen Mock-Server weiter und schob im nächsten Test einen fremden
  Computer-Use-Lauf über das Diagramm. Evidence-Tests stoppen am Ende (`__hud.stop()`).
- **Orchestrator-Neustart:** Das HUD verbindet sich selbst neu, Events während der Lücke
  gehen verloren (z. B. der erste Briefing-Punkt).
