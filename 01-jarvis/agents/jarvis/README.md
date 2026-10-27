# Jarvis als ElevenLabs-Agent (Konfiguration als Code)

Hier liegt der Sprach-Agent von JARVIS: Persona, Stimme, Gesprächsmodell und die Client-Tools
(Werkzeuge, die im Browser laufen) als JSON-Dateien. Die Fachlogik bleibt im Orchestrator,
die Tools werden im HUD ausgeführt und rufen `POST :8787/tools/{name}` auf.
Node ≥ 24, offizielle ElevenLabs-CLI 1.4.0, eigene npm-Installation in diesem Ordner.

| Datei | Inhalt |
|---|---|
| `agent_configs/jarvis.json` | Persona-Prompt, erste Nachricht, LLM, Stimme, Turn-Verhalten |
| `tool_configs/*.json` | Ein Client-Tool pro Datei, **generiert** aus `packages/contracts` |
| `tools.json`, `agents.json` | Verknüpfung zu den Remote-IDs in deinem ElevenLabs-Konto (anfangs leer) |
| `scripts/` | Generieren, Prüfen, Pushen, Stimmen- und Modellvergleich, Latenzmessung |
| `examples/hud-bridge.mjs` | Minimalbeispiel, wie Client-Tools und Hintergrund-Ergebnisse verdrahtet werden |

## Lokal prüfen (ohne Key)

```bash
cd agents/jarvis
npm ci --ignore-scripts --workspaces=false
npm run gen        # tool_configs/ aus den Contracts neu erzeugen
npm test           # Konfiguration gegen das API-Schema der CLI prüfen
npm run push:plan  # Trockenlauf, nichts wird hochgeladen
```

`gen_tools.mjs` liest die Tool-Metadaten (`TOOL_META`) und die generierten JSON-Schemas aus
`packages/contracts`. Es gibt also keine zweite, kopierte Tool-Liste. Nach Änderungen an den
Contracts erst im Repo-Root `make gen`, dann hier `npm run gen`.

## Agent in dein ElevenLabs-Konto pushen

Alle Skripte lesen `ELEVENLABS_API_KEY` aus der `.env` im Repo-Root.

```bash
npm run push:agent   # Tools anlegen, IDs eintragen, Agent anlegen, alles zurücklesen und vergleichen
```

`push:agent` ist ein ElevenLabs-Deploy, kein Git-Push. Danach stehen die Remote-IDs in
`agents.json` und `tools.json`. Die Agent-ID (`agent_…`) trägst du als `ELEVENLABS_AGENT_ID`
in die Root-`.env` ein. Nimm für den ersten Push immer diesen Wrapper: Ein nacktes
`elevenlabs agents push` verknüpft die neu erzeugten Tool-IDs nicht. Der Wrapper löscht nichts
und kann nach einem Teilfehler einfach erneut laufen.

Hinweis: `agents.json` und `tools.json` enthalten nach dem Push IDs aus deinem Konto. Wenn du
dein Repo veröffentlichst, leere sie vorher wieder.

### Host: global oder EU

Standard ist `https://api.elevenlabs.io`. Hast du einen EU-Workspace (Datenresidenz in der EU),
setze in der Root-`.env`:

```bash
ELEVENLABS_API_BASE=https://api.eu.residency.elevenlabs.io
```

Skripte, CLI und HUD-Serverroute nutzen dann diesen Host. Im HUD zusätzlich
`NEXT_PUBLIC_ELEVENLABS_SERVER_LOCATION=eu-residency` setzen (siehe `apps/hud/.env.example`).

## Stimme und Gesprächsmodell

Startstimme ist „Daniel“ (`onwK4e9ZLuTAKqWW03F9`), eine Standardstimme, die in jedem Konto
vorhanden ist. Für JARVIS lohnt sich eine native deutsche Stimme:

```bash
npm run voices                    # deutsche Männerstimmen aus Workspace und Library auflisten
npm run voices -- --render        # Hörproben als MP3 nach voice-samples/ (Library-Stimmen werden dabei deinem Workspace hinzugefügt)
npm run voices -- --select VOICE_ID
npm run push:agent
```

Das Gesprächsmodell steht in `agent_configs/jarvis.json` unter `prompt.llm`
(`gemini-3.5-flash-lite`, Reasoning `minimal`). Vergleich und Wechsel:

```bash
npm run compare -- --list         # verfügbare Modelle in deinem Workspace
npm run compare -- --run          # je drei identische Tool-Tests pro Kandidat
npm run compare -- --select MODEL_ID
npm run push:agent
```

Nimm zum Wechseln immer `--select`: Es setzt `reasoning_effort` passend, sonst lehnt
ElevenLabs den Push ab.

## Latenz messen

```bash
npm run latency -- --live         # fünf deutsche Fragen als synthetisches Audio, Median bis zum ersten Audio
npm run latency -- --live --text  # ohne Spracherkennung, nur LLM und Stimme
```

Beides misst bis zum ersten empfangenen Audio, nicht bis zur Wiedergabe im Lautsprecher.
Optionaler Live-Test, nur lesend: `RUN_ELEVENLABS_LIVE=1 npm test`.

## Wie das HUD den Agenten nutzt

- Die HUD-Serverroute `/api/elevenlabs/session` holt mit deinem Key eine kurzlebige
  Signed URL. Der Key landet nie im Browser.
- Jedes Tool aus `tool_configs/` ist im HUD als Client-Tool registriert. Langlaufende Tools
  (`delegate_task`, `start_computer_task`, `send_email`, `place_call`) antworten sofort mit
  einer `taskId`, das Ergebnis kommt später als Event.
- Ergebnisse gehen als contextual update an den Agenten. Weil das allein keine Antwort
  auslöst, stößt das HUD an einer Sprechpause eine Nachricht an, die mit
  `HUD-Systemmeldung:` beginnt. Der Persona-Prompt behandelt sie als „kein Auftrag, keine
  Freigabe“.
- Der Agent ist privat (`enable_auth: true`), ohne Signed URL kommt niemand hinein.

## Quellen

- [Agents Platform](https://elevenlabs.io/docs/eleven-agents/overview)
- [CLI und Dateiformat](https://elevenlabs.io/docs/eleven-agents/operate/cli)
- [Client-Tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools)
- [Contextual updates und User-Nachrichten](https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events)
- [EU Data Residency](https://elevenlabs.io/docs/overview/administration/data-residency)
- [Modelle](https://elevenlabs.io/docs/eleven-agents/customization/llm)
