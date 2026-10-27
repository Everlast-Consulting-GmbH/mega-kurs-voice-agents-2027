# Beispiel-Ablauf: „Ein Morgen mit Jarvis“

So führen wir JARVIS im Video vor. Nimm den Ablauf als Vorlage für deine eigene Demo: Er zeigt
in sechs bis acht Minuten alles, was die Codebasis kann. JARVIS **zeigt** dabei nicht nur
Informationen, man sieht ihn in realistisch aussehenden Programmen **arbeiten**, mehrere Agenten
gleichzeitig. Die Bildvorlage dafür liegt in `apps/hud/design/agents-desktop-mockup.html`.

Start: `make demo`, dann im Dashboard auf „Anrufen“ klicken.

## Die Geschichte

Alle Testdaten in der Testwelt (Mock-World) gehören zu einer erfundenen Geschichte. Leo leitet
eine kleine KI-Agentur, es ist Montagmorgen.

| Wer | Rolle in der Geschichte |
|---|---|
| **Thomas Müller**, Müller GmbH (München, Maschinenbau) | Heißester Lead, 84.000 € für einen KI-Telefonassistenten, Phase „Angebot“. Schreibt heute: „Unterschrift heute möglich?“ |
| **Dr. Anna Weber**, Hausarztpraxis Weber (München) | Bestandskundin (gewonnen, 18.000 €). Die Agentur richtet ihren KI-Empfang ein und betreut dafür ihr Praxissystem PraxisPilot, das keine API (Programmierschnittstelle) hat |
| **Hansa Kliniken** (Hamburg) | Großer Lead, 120.000 €, Phase „Angebot“ |
| **Brandt AG** (Stuttgart), Ansprechpartnerin Sarah Klein | Qualifiziert, 48.000 €, will Workshop-Termine im vierten Quartal |
| **Nordlicht Logistik** (Bremen) | Qualifiziert, 31.000 € |
| **Mara** (Vertrieb), **Jonas** (Delivery) | Das Team im Chat (#vertrieb, #delivery, #allgemein) |

Alle Firmen, Personen, Adressen und Nummern sind erfunden. Wie Jarvis dich anspricht, stellst du
mit `DEMO_USER_NAME` in der `.env` ein.

## Ablauf

| # | Szene | Du sagst | Was man sieht | Effekt |
|---|---|---|---|---|
| 0 | Auftakt | (zum Publikum) „Das ist Jarvis. Kein Video, alles live.“ Klick auf „Anrufen“. | Himmel blendet auf, die Kugel sammelt sich. „Guten Morgen, Leo.“ | Ruhe, Stimme |
| 1 | Briefing | „Jarvis, was ist heute wichtig?“ | Kalender, Mail und CRM fächern sich als Fenster auf, Jarvis zieht die Punkte heraus. Oben rechts kommt die Mitteilung „Thomas Müller: Unterschrift heute möglich?“ herein. | Echte Programme, Live-Ereignis |
| 2 | Höhepunkt | „Kümmer dich um die Müller GmbH.“ | Jarvis sagt den Plan an (vier Schritte), du sagst „Ja“. **Vier Agenten arbeiten gleichzeitig:** Mail-Antwort wird getippt und gesendet, Kalendertermin um 15 Uhr erscheint, Chat-Nachricht an #vertrieb, der Deal rutscht im CRM auf „Verhandlung“. Danach die Bilanz mit gemessener Dauer und geschätzter Zeitersparnis. | Parallele Agenten, Tempo |
| 3 | Zahlen | „Wie sieht die Pipeline jetzt aus?“ | Diagramm auf der Bühne, die Überschrift nennt die Erkenntnis, der Müller-Deal ist schon eingerechnet. Taste `D` zeigt die Erklär-Leiste. | Konsistenz, Transparenz |
| 4 | App ohne API | „Dr. Weber will ihren KI-Empfang testen. Leg ihr in PraxisPilot einen Testtermin an, Dienstag 10 Uhr.“ | Computer Use (die KI bedient Maus und Tastatur): Jarvis klickt sich durch die Praxis-App. Währenddessen fragst du „Was steht heute noch an?“ und Jarvis antwortet, ohne aufzuhören. | Geht sogar ohne Schnittstelle |
| 5 | Abschluss | „Danke, Jarvis. Das war's.“ | Kurzer, trockener Schlusssatz, die Kugel kommt zur Ruhe. | Persönlichkeit |

## Absicherung mit Regie-Tasten

Die Tasten sind für das Publikum unsichtbar, die Bestätigung erscheint nur in der Erklär-Leiste.

| Wenn | Dann | Taste |
|---|---|---|
| Daten verstellt | zwischen Proben zurücksetzen | `R` |
| Mitteilung in Szene 1 soll von Hand kommen | auslösen | `N` |
| Szene 2 läuft nicht an | Lauf direkt starten (gleicher Ablauf, ohne Sprachbefehl) | `M` |
| Computer Use hängt | nach 90 Sekunden bricht Jarvis ab und sagt es ehrlich, dann erneut starten | `C` |
| Ton oder Netz fallen aus | Aufzeichnung einer Probe abspielen | keine |

Ohne Stimme proben: `uv run python tools/demo_drive.py` ruft dieselben Werkzeuge über das echte
Gateway auf, `uv run python tools/demo_drive.py notice` löst die dringende Mitteilung aus.
