# JARVIS weiterbauen

Mit diesen Prompts erweiterst du JARVIS in Claude Code. Starte Claude Code im Ordner `01-jarvis`, schalte für größere Umbauten den Plan-Modus ein (Shift+Tab) und lass dir den Plan zeigen, bevor Code entsteht. Werte in spitzen Klammern wie `<DEIN_CRM>` ersetzt du durch deine eigenen.

Die Prompts stützen sich auf die echte Struktur dieses Repos.

Bevor du anfängst: `make test` sollte grün sein. Dann siehst du nach jeder Erweiterung sofort, ob etwas kaputtgegangen ist.

## Prompt 1: Echte Google-Anbindung statt Testwelt

```text
Lies README.md, docs/ARCHITECTURE.md und services/orchestrator/jarvis_orchestrator/gateway.py. Ich will JARVIS an meinen echten Google-Kalender und mein Gmail anbinden, die Testwelt soll als Standard erhalten bleiben.

Bau einen Adapter im Orchestrator, der per Umgebungsvariable DATA_SOURCE=mock|google umschaltet. Für Google:
- OAuth 2.0 als Desktop-App mit den Scopes gmail.readonly, gmail.compose und calendar.events. Kein gmail.send.
- Der Token liegt lokal in einer Datei, die in .gitignore steht. Client-ID und Secret kommen aus der .env, trag sie in .env.example als leere Variablen mit Hinweis ein.
- list_emails, read_email und list_events lesen echte Daten und geben dieselben Pydantic-Modelle zurück wie die Testwelt (packages/contracts).
- reply_email und send_email legen nur einen Gmail-Entwurf an. Gesendet wird ausschließlich nach Freigabe im HUD (approval.requested, dann approval.resolved), und auch dann erst einmal nur als Entwurf, bis ich SEND_ENABLED=true setze.
- create_event legt Termine nur in einem eigenen Kalender „JARVIS“ an, nie im Hauptkalender.

Schreib Tests mit gemockter Google-API (kein echter Account im Test) und ergänze in der README einen Abschnitt „Google anbinden“ mit den Schritten in der Google Cloud Console. Zeig mir vorher den Plan.
```

**Warum so:** Lesen ist ungefährlich, Senden nicht. Deshalb nur die Scopes, die du wirklich brauchst, Entwürfe statt Versand und eine Freigabe, die der Code erzwingt und nicht das Sprachmodell. Die Testwelt bleibt Standard, damit Tests und Mock-Modus weiter ohne Account laufen. Ein eigener Kalender verhindert, dass ein Fehler deinen echten Tag durcheinanderbringt.

## Prompt 2: Outlook und Microsoft 365 über Microsoft Graph

```text
Lies services/orchestrator/jarvis_orchestrator/gateway.py und den Adapter für DATA_SOURCE (falls schon vorhanden). Ergänze DATA_SOURCE=microsoft für Outlook-Mail und Outlook-Kalender über Microsoft Graph.

- App-Registrierung in Entra ID mit delegierten Rechten Mail.Read, Mail.ReadWrite (nur für Entwürfe), Calendars.ReadWrite. Kein Mail.Send.
- Anmeldung per Device-Code-Flow mit MSAL, Token-Cache lokal in einer Datei aus .gitignore. Tenant-ID und Client-ID in .env.example.
- Dieselben Werkzeuge und Rückgabemodelle wie bei Google und der Testwelt. Antworten landen als Entwurf, Termine in einem eigenen Kalender „JARVIS“.
- Zeitzonen sauber nach Europe/Berlin umrechnen, Graph liefert UTC.

Tests mit gemockten Graph-Antworten, README-Abschnitt „Outlook anbinden“. Plan zuerst.
```

**Warum so:** Hinter allen drei Datenquellen steckt dasselbe Werkzeug-Set. Dadurch muss weder der ElevenLabs-Agent noch das Dashboard etwas von Outlook wissen. Der Device-Code-Flow funktioniert ohne Redirect-URL, das ist für eine lokale App der einfachste Weg. Zeitzonen sind die häufigste Fehlerquelle bei Kalendern, deshalb steht die Umrechnung ausdrücklich im Prompt.

## Prompt 3: Eigenes CRM anbinden

```text
Lies packages/contracts/src/domain.ts (Lead), services/mock-world/jarvis_mock_world/app.py und die CRM-Werkzeuge list_leads, get_lead und move_deal im Gateway. Ich nutze als CRM <DEIN_CRM> mit dieser API-Dokumentation: <LINK_ZUR_API_DOKU>.

Bau einen CRM-Adapter im Orchestrator (CRM_SOURCE=mock|<dein_crm>), der meine Deals auf das bestehende Lead-Modell abbildet. Mach mir zuerst eine Tabelle, welches Feld meines CRMs auf welches Lead-Feld passt und welche Pipeline-Phasen auf neu, qualifiziert, angebot, verhandlung, gewonnen und verloren abgebildet werden. Fehlende Werte bleiben leer, nichts wird erfunden.

move_deal darf nur nach Freigabe schreiben. Der API-Key kommt aus der .env. Die Datensätze für render_widget (pipeline_by_month, leads_by_city) sollen aus denselben CRM-Daten berechnet werden. Tests mit aufgezeichneten, anonymisierten Beispielantworten.
```

**Warum so:** Das Mapping zuerst als Tabelle zu sehen spart dir die meisten Fehler: Phasen heißen in jedem CRM anders. Weil das Dashboard nur das Lead-Modell kennt, bleibt die ganze Oberfläche unverändert. Und „nichts erfinden“ gehört in jeden Prompt, der Daten zusammenführt, sonst füllt die KI Lücken mit plausiblen Werten.

## Prompt 4: Ein eigenes Werkzeug ergänzen

```text
Ich will JARVIS ein neues Werkzeug geben: <NAME_DES_WERKZEUGS>, das <WAS_ES_TUN_SOLL>. Geh genau den Weg, den das Repo vorsieht:

1. Eingaben in packages/contracts/src/tools.ts unter ToolInputs ergänzen, jedes Feld mit .describe() auf Deutsch. Eintrag in TOOL_META mit latency fast (antwortet in unter 300 ms) oder async (gibt sofort eine taskId zurück).
2. Im Repo-Root make gen ausführen, damit JSON Schema und Python-Modelle neu entstehen.
3. Die Ausführung in services/orchestrator/jarvis_orchestrator/gateway.py (fast) oder tasks.py (async) bauen, falls nötig mit einem neuen Endpunkt in der Testwelt.
4. In agents/jarvis npm run gen, dann den Persona-Prompt in agent_configs/jarvis.json um einen Satz ergänzen, wann das Werkzeug zu nutzen ist.
5. Im Dashboard ist das Werkzeug automatisch als Client-Tool registriert (apps/hud/lib/voice/elevenlabs/tools.ts). Prüf, ob es in apps/hud/lib/voice/elevenlabs/display.ts eine Anzeige braucht.
6. Tests in packages/contracts, services/orchestrator/tests und apps/hud/test ergänzen, dann make test.

Pushe den Agenten erst, wenn ich es sage (npm run push:agent).
```

**Warum so:** Die Contracts sind die einzige Quelle für alle Werkzeuge. Aus ihnen entstehen die Tool-JSONs für ElevenLabs, die Validierung im Orchestrator und die Client-Tools im Dashboard. Wer ein Werkzeug nur an einer Stelle einbaut, bekommt Fehler, die erst im Gespräch auffallen. Die feste Reihenfolge im Prompt sorgt dafür, dass Claude Code keinen Schritt auslässt.

## Prompt 5: Andere Stimme oder anderes Sprachmodell

```text
Lies agents/jarvis/README.md und agent_configs/jarvis.json. Ich will eine natürlichere deutsche Stimme und prüfen, ob ein anderes Gesprächsmodell schneller ist.

1. Führ npm run voices -- --render aus und leg die Hörproben ab. Ich höre sie an und nenne dir die Voice-ID.
2. Setz sie mit npm run voices -- --select <VOICE_ID>.
3. Vergleich mit npm run compare -- --run die verfügbaren Modelle: Tool-Erfolg und Geschwindigkeit, je drei Durchläufe.
4. Miss mit npm run latency -- --live die Zeit bis zum ersten Ton für die aktuelle und die beste neue Variante.
5. Zeig mir eine Tabelle mit Modell, Tool-Erfolg und Median bis zum ersten Ton. Gewechselt wird nur, wenn das neue Modell alle Tool-Tests besteht und schneller ist. Dann npm run compare -- --select <MODEL_ID> und npm run push:agent.
```

**Warum so:** Bei Sprachagenten zählt die Zeit bis zum ersten Ton mehr als die Intelligenz des Gesprächsmodells, die schwere Arbeit macht ohnehin Claude im Hintergrund. Deshalb wird gemessen statt geraten. Die Stimme wählst du selbst nach Gehör: Das kann kein Test für dich entscheiden.

## Prompt 6: Eine Telefonnummer für JARVIS

```text
Lies docs/DECISIONS.md (Eintrag zum Voice-Layer), tasks.py (place_call) und docs/ARCHITECTURE.md. Ich will, dass JARVIS mich anrufen kann und dass ich ihn anrufen kann.

- Verbinde eine Telefonnummer von <DEIN_TELEFONIE_ANBIETER, z. B. Twilio> mit dem ElevenLabs-Agenten und nutze die Outbound-Call-API von ElevenLabs.
- Am Telefon gibt es keinen Browser. Die Werkzeuge müssen deshalb zusätzlich als Server-Tools (Webhooks) laufen, die den Orchestrator erreichen. Schlag mir vor, wie ich den Orchestrator dafür sicher öffentlich erreichbar mache (Tunnel oder Server, mit Token-Prüfung).
- Bau den Dienst hinter VOICE_AGENT_URL: POST /calls startet den Anruf, der Anrufverlauf geht als call.state per POST /events an den Orchestrator.
- place_call mit to="me" ruft nur meine eigene Nummer aus der .env an. Andere Nummern nur nach Freigabe.

Telefonnummern in Tests und Beispielen nur aus dem Bereich +49 30 23125 xxx. Plan zuerst.
```

**Warum so:** Im Browser laufen die Werkzeuge als Client-Tools, am Telefon geht das nicht. Das ist der eigentliche Umbau, nicht die Nummer selbst. Ein öffentlich erreichbarer Orchestrator braucht Schutz, sonst kann jeder deine Werkzeuge aufrufen. Und ausgehende Anrufe an fremde Nummern sind rechtlich heikel, deshalb die Freigabe.

## Prompt 7: Neue Hintergrundaufgabe für den Orchestrator

```text
Lies services/orchestrator/jarvis_orchestrator/runs.py, tasks.py und agent.py. Ich will einen neuen mehrteiligen Auftrag: „<DEIN_AUFTRAG, z. B. Bereite mein Meeting mit der Brandt AG vor>“. Dabei sollen <ANZAHL> Agenten parallel arbeiten: <TEILAUFGABEN, z. B. Mails zum Kunden zusammenfassen, offene Punkte aus dem CRM holen, Agenda als Entwurf schreiben>.

- Der Planer (ClaudePlanner) erzeugt den Plan, Jarvis sagt ihn an, ausgeführt wird erst nach dem „Ja“ (run.planned mit approvalId).
- Jeder Agent meldet seine Schritte als agent.action, damit das Dashboard sie in den App-Fenstern abspielt. Prüf in apps/hud/lib/apps/views.ts, ob die Aktionen dort dargestellt werden können, sonst ergänze die Ansicht.
- Am Ende run.summary mit gemessener Dauer. Das Ergebnis meldet Jarvis in der nächsten Gesprächspause.
- Zeitlimit und Kostenlimit pro Lauf wie bei den bestehenden Delegationen.

Ergänze ein Szenario in tools/mock-events/src/scenarios.ts, damit ich den Ablauf ohne Keys im Mock-Modus sehen kann, und Tests in services/orchestrator/tests.
```

**Warum so:** Lange Aufgaben laufen asynchron: Das Werkzeug meldet sofort eine Nummer, die Arbeit läuft im Hintergrund, und Jarvis bleibt ansprechbar. Plan ansagen und erst nach dem „Ja“ ausführen hält dich in Kontrolle. Das Mock-Szenario zuerst zu bauen lohnt sich, weil du die Darstellung ohne Kosten und ohne Wartezeit verfeinern kannst.

## Prompt 8: Tests und Evals ergänzen

```text
Lies agents/jarvis/README.md, agents/jarvis/scripts/compare_llms.mjs und die Tests unter services/orchestrator/tests und apps/hud/test. Ich will sicher sein, dass JARVIS nach jeder Änderung noch richtig handelt.

1. Schreib 15 Testfälle als Tabelle: Satz des Nutzers, erwartetes Werkzeug, erwartete Parameter, was Jarvis auf keinen Fall tun darf. Darunter mindestens drei, bei denen Jarvis nachfragen oder ablehnen muss (unbekannte Firma, Mail ohne Freigabe senden, mehrdeutiger Termin).
2. Leg sie als ElevenLabs-Agent-Tests an (Tool-Aufruf prüfen) und als Skript npm run evals, das sie ausführt und eine Ergebnistabelle schreibt.
3. Ergänze einen Orchestrator-Test, der beweist, dass send_email, reply_email und move_deal ohne Freigabe nichts schreiben.
4. Miss mit npm run latency -- --live den Median bis zum ersten Ton und schreib das Ergebnis in die Tabelle.

Alles, was einen Key braucht, wird ohne Key übersprungen, damit make test weiter ohne Konten läuft.
```

**Warum so:** Ein Sprachagent ändert sein Verhalten schon durch einen Satz im Prompt. Ohne feste Testfälle merkst du das erst in der Vorführung. Die Negativfälle sind die wichtigsten: Ein Agent, der nie „nein“ sagt, erfindet Daten. Der Freigabe-Test sichert ab, dass die Regel im Code steckt und nicht nur im Prompt.

## Nach jeder Erweiterung

- `make test` ausführen.
- Im Mock-Modus prüfen, ob das Dashboard die neuen Events darstellt.
- Agent erst pushen (`npm run push:agent` in `agents/jarvis`), wenn Tests grün sind.
- Neue Keys nur in die `.env`, Platzhalter in die `.env.example`.
- Eine Entscheidung, die künftige Arbeit steuert, als Eintrag in `docs/DECISIONS.md` festhalten.
