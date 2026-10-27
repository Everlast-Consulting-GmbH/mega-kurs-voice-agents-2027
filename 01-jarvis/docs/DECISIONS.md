# Entscheidungen

Neueste oben. Aufgenommen ist nur, was künftige Arbeit steuert. Wer eine Entscheidung
ändert, hängt einen neuen Eintrag an und markiert den alten als überholt. So siehst du beim
Weiterbauen, warum JARVIS so gebaut ist, wie er gebaut ist.

## 2026-10-12: Agenten arbeiten sichtbar in App-Fenstern; Briefing und Mitteilung in derselben Sprache

**Entscheidung:** Mehrteilige Aufträge laufen im HUD als Agenten-Lauf (`agents-desktop-mockup.html`
Bild A/B): pro Agent ein realistisches App-Fenster mit farbigem Cursor, das HUD spielt die
`agent.action`-Events pro Agent nacheinander mit Mindestdauern ab. Das Briefing fächert Kalender,
Mail und CRM als Fenster auf (Bild C) statt der Karten-Bühne; `notice` ist eine Mitteilung oben
rechts und nimmt nie die Bühne. Regie-Tasten `R N M C`, Ton deshalb auf `T`.
**Warum:** Feedback aus den Proben: „es passiert zu wenig, sieht nach Demo aus“.
Ein Backend, das Events schneller feuert als man zusehen kann, darf die Animation nicht kaputt
machen, daher bestimmt das HUD das Tempo, nicht der Event-Takt.
**Konsequenz:** Neue Agenten-Apps brauchen eine Ansicht in `lib/apps/views.ts` und ein Fenster
in `components/apps`; die Aktions-Konventionen (z. B. Kalender-`select` mit `to` = ISO-Start)
sind die Schnittstelle zum Orchestrator. Die Pointe zeigt die vom Orchestrator gemessene Dauer,
auch wenn das Abspielen etwas länger dauert. Kleinste Schrift in den App-Fenstern liegt bei
11,5 bis 13 px (unter der 0,9-%-Regel), damit sie wie echte Programme wirken; was das Publikum lesen
soll (getippter Text, Karten, Titel), ist ≥ 15 px.
**Verworfen:** Pro Event sofort den Endzustand zeigen (kein sichtbares Arbeiten); Briefing-Karten
behalten (passt nicht zur neuen Bildsprache); Mitteilung als Bühne (verdrängt das Briefing).

## 2026-10-12: Bildaufbau „Sprecher + Bühne“ ersetzt Szene 2.0 und Terminal-HUD

**Entscheidung:** Das HUD folgt verbindlich `apps/hud/design/stage-layout-mockup.html`: Jarvis
(Kugel + ein großer Satz) als Sprecher, daneben genau eine Bühne (Eyebrow, Aussage als
Überschrift, Beleg); Computer Use macht das Agent-Fenster zur Bühne, der Anruf blendet alles
andere aus. Taste `D` zeigt eine Erklär-Leiste in Klartext; Schublade, Terminal-HUD
(`?view=details`) und das Partikel-Morphing sind entfernt.
**Warum:** Die frühere Szene 2.0 hatte Effekte, aber keinen Bildaufbau; Texte gingen im Himmel unter, alles
war für den Beamer zu klein, die Details zeigten Entwicklerwerte. Die Vorlage ist seitdem verbindlich.
**Konsequenz:** Neue Inhalte bekommen einen Platz in der Bühnen-Priorität (`stageItem()` in
`lib/stage.ts`), keine eigene Fläche. Kleinste Schrift ≥ 0,9 % der Breite, Bühnen-Überschrift aus
Daten berechnet. Das Agent-Fenster behält das echte Seitenverhältnis (16:10), es ist daher
schmaler als in der Vorlage.
**Verworfen:** Terminal-HUD als Debug-Ansicht behalten (zweite Ansicht pro Event-Typ pflegen,
niemand nutzt es auf der Bühne); Bühnen nebeneinander (widerspricht „genau eine Bühne“).

## 2026-10-12: Orchestrator nutzt Claude Haiku 5.5 statt Opus 5.5

**Entscheidung:** `ORCHESTRATOR_MODEL` ist standardmäßig `claude-haiku-5-5` (über Requesty).
**Warum:** Für die Demo-Aufgaben braucht es kein Opus. Live gemessen mit
„Fasse die drei wichtigsten Leads zusammen":
- Haiku 5.5: 4,9 s, sachlich korrekt, erkennt sogar verlorene Leads.
- Sonnet 5.5: 6,6 s.
**Konsequenz:** Delegierte Ergebnisse kommen schneller zurück und kosten weniger. Für schwierige
Aufgaben bleibt `ORCHESTRATOR_MODEL` per `.env` umstellbar.

## 2026-10-12: Computer Use direkt über Anthropic, Gesprächsmodell Gemini 3.5 Flash-Lite mit Überbrückungssatz

**Entscheidung:** Der CU-Worker braucht für den Pixel-Modus einen direkten `ANTHROPIC_API_KEY`;
Orchestrator-Claude bleibt bei Requesty. Der ElevenLabs-Agent nutzt `gemini-3.5-flash-lite` mit
Reasoning `minimal`, und Daten-Tools sprechen vor dem Aufruf einen kurzen Überbrückungssatz
(`pre_tool_speech: force`, außer bei `focus_entity`, `render_widget` und `resolve_approval`).
**Warum:** Requesty baut `computer_toolset_20260801` in ein „custom"-Tool um, Anthropic lehnt das
ab. Getestet über anthropic/, bedrock/ und vertex/, jedes Mal Fehler. Live gemessen (5 deutsche
Fragen, Sprechende bis erstes Audio, Median):
- Gemini 3.8 Flash: 3,8 s
- Gemini 3.5 Flash-Lite allein: 1,7 s
- dazu der Überbrückungssatz: 1,1 bis 1,2 s

Im Textmodus kamen Claude Haiku 4.5 auf 2,6 s und GPT-5.4-mini auf 1,5 s.
**Konsequenz:** Ohne direkten Anthropic-Key läuft Computer Use nur im Modus `assisted`. Beim
Modellwechsel immer `npm run compare -- --select <llm>` nutzen: Das setzt `reasoning_effort`
explizit, auch auf `null`. Ein Push übernimmt sonst den alten Wert, und ElevenLabs lehnt ihn ab.
**Verworfen:** Gemini 3.8 Flash (kein Reasoning unter `low`, 3,7 bis 9,9 s); eigenes
Computer-Tool als „custom"-Tool über Requesty (ohne natives Toolset unzuverlässiger).

## 2026-10-09: Jarvis spricht proaktiv per Nutzernachricht an Turn-Grenzen

**Entscheidung:** Ergebnisse, Freigaben und dringende Hinweise gehen sofort als contextual
update an den Agenten; das Sprechen stößt das HUD danach mit `sendUserMessage` an, aber nur
an einer sicheren Turn-Grenze (Jarvis und Nutzer still, keine Antwort ausstehend).
**Warum:** Contextual updates lösen beim ElevenLabs-Agenten keine Antwort aus; Ergebnisse kamen
erst nach dem nächsten Satz des Nutzers. Ein Anstoß mitten in einen Turn würde Jarvis oder den
Nutzer unterbrechen.
**Konsequenz:** Pro Turn-Grenze höchstens ein Anstoß, der alle offenen Punkte bündelt; der
nächste erst, nachdem Jarvis geantwortet hat (oder nach 10 s). Dringende `notice` ändern nur
den Text des Anstoßes (höfliche Unterbrechung), nicht die Turn-Regel.
**Verworfen:** Jarvis mitten im Satz unterbrechen; Server-Tools/Webhooks, die den Agenten von
außen sprechen lassen (bräuchte öffentliche URL).

## 2026-10-09: Voice-Layer ist ElevenLabs Agents, Tools laufen als Client-Tools im Browser

**Entscheidung:** Standard-Voice-Layer ist ein ElevenLabs-Agent (globaler Host, EU-Residency per `ELEVENLABS_API_BASE` möglich). Die
Gateway-Tools werden als Client-Tools im HUD ausgeführt (Browser → `POST :8787/tools/{name}`).
Ergebnisse asynchroner Tasks (`task.done`/`task.failed`) schickt das HUD als contextual update an
den Agenten.
**Warum:** Für eine Demo der einfachste Weg.
Client-Tools brauchen keine öffentliche URL und keinen Tunnel.
**Konsequenz:** Kein `OPENAI_API_KEY` und keine LiveKit-Keys nötig. Agent-Konfiguration liegt als
Code im Repo. Für Telefonie (kein Browser im Gespräch) braucht der Agent später Server-Tools über
eine öffentliche URL und eine Telefonnummer in ElevenLabs.
**Verworfen:** LiveKit Agents mit `gpt-realtime-2.1`. Diese Variante ist in diesem Repo nicht
enthalten.

## 2026-10-09: Claude-Aufrufe laufen über Requesty

**Entscheidung:** Orchestrator (Claude Agent SDK) und CU-Worker (Messages API) nutzen Requesty,
sobald `REQUESTY_API_KEY` gesetzt ist; `ANTHROPIC_API_KEY` ist nur Fallback.
**Warum:** Ein Schlüssel, eine Abrechnung, Modellwechsel ohne Codeänderung. Was über Requesty geht,
läuft über Requesty.
**Konsequenz:** Modell-IDs bekommen automatisch das Präfix `anthropic/`. Ob Requesty das
Computer-Toolset `computer_toolset_20260801` sauber durchreicht, ist erst mit Live-Key prüfbar;
falls nicht, nur der CU-Worker direkt über Anthropic.
**Verworfen:** Realtime-Stimme über Requesty: Requesty bietet keine Realtime-API.

## 2026-10-09: Event-Hub im Orchestrator-Prozess statt Redis

**Entscheidung:** Der Orchestrator verteilt Events in-process (WS-Broadcast, `POST /events`
als Ingest); kein Redis.
**Warum:** Ein Orchestrator-Prozess, ein Demo-Nutzer: Redis wäre nur zusätzlicher Betrieb.
**Konsequenz:** Der Orchestrator darf nicht horizontal skaliert werden. Bei mehreren Instanzen
muss ein Bus (Redis/NATS) nachgerüstet werden.
