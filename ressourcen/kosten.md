# Kosten: Was ein Voice Agent pro Minute kostet

Diese Seite rechnet das Beispiel aus dem Video nach. Die Tabellen haben eine Formelspalte, damit du deine eigenen Zahlen
einsetzen kannst. Preise mit Stand Oktober 2026. Anbieter rechnen meist in US-Dollar ab, im Video sind Dollar und Euro
der Einfachheit halber gleichgesetzt.

## Das Rechenbeispiel

Deine Mitarbeiter telefonieren 100 Mal am Tag. Jedes Gespräch dauert 5 Minuten, dazu kommen 5 Minuten Nachbereitung.

### Mensch am Telefon

| Größe | Formel | Unser Beispiel | Dein Wert |
|---|---|---|---|
| A: Anrufe pro Tag | | 100 | |
| B: Minuten pro Anruf inkl. Nachbereitung | | 5 + 5 = 10 | |
| C: Arbeitsminuten pro Tag | A × B | 1.000 Minuten | |
| D: Arbeitsstunden pro Tag | C ÷ 60 | 16,67 Stunden | |
| E: Vollzeitkräfte | D ÷ 8, aufgerundet für Pausen und Ausfälle | mindestens 2,5 | |
| F: Stundenlohn | | rund 14 € (nahe am Mindestlohn) | |
| G: Aufschlag Arbeitgeberanteil und Nebenkosten | | 30 %, also × 1,3 | |
| **H: Kosten pro Monat** | E × 160 Stunden × F × 1,3 | **7.280 €** | |

Dazu kommen Pausen, Krankheitstage, Urlaub, Fluktuation, Einarbeitung und Gespräche, die nicht immer auf Top-Niveau
geführt werden.

### Voice Agent

Ein Voice Agent braucht keine Nachbereitung, denn alles passiert automatisch im Telefonat. Er braucht also nur die
reine Gesprächszeit.

| Größe | Formel | Unser Beispiel | Dein Wert |
|---|---|---|---|
| A: Anrufe pro Tag | | 100 | |
| I: Gesprächsminuten pro Anruf | | 5 | |
| J: Gesprächsminuten pro Tag | A × I | 500 Minuten (8,33 Stunden) | |
| K: Preis pro Minute | | 0,15 € | |
| L: Kosten pro Tag | J × K | 75 € | |
| M: Erreichbare Arbeitstage pro Monat | | 21 | |
| **N: Kosten pro Monat** | L × M | **1.575 €** | |

Ohne Lohnnebenkosten, ohne Krankheit, ohne Urlaub. Der Mensch kostet in diesem Beispiel also fast das Fünffache
(7.280 € ÷ 1.575 € ≈ 4,6).

**Warum 15 Cent?** Auf rund 15 Cent pro Minute muss ein Voice Agent kommen, damit er sich wirtschaftlich lohnt. Auf
diesen Preis hat sich die Branche in den letzten Jahren eingependelt. 2024 lagen die Kosten noch bei etwa 20 bis 30
Cent pro Minute.

### Mit GPT-Live

| Größe | Formel | Unser Beispiel | Dein Wert |
|---|---|---|---|
| J: Gesprächsminuten pro Tag | | 500 | |
| P: Sprachebene GPT-Live (`gpt-live-1`) | | 0,05 $ pro Minute | |
| Q: Denkebene GPT-6 Luna, Medium Reasoning Effort | | 0,2 bis 0,4 Cent pro Minute | |
| R: Preis pro Minute | P + Q | rund 0,053 $ | |
| M: Arbeitstage pro Monat | | 21 | |
| **S: Kosten pro Monat** | J × R × M | **rund 556 $, im Video gerundet 560 €** | |

Das ist etwa ein Dreizehntel dessen, was menschliche Telefonisten in diesem Beispiel kosten (7.280 ÷ 560 ≈ 13).
**Noch nicht enthalten ist die Telefonie**, also Telefonnummer und Minutenpreis ins Telefonnetz.

## Woraus sich die Kosten zusammensetzen

### Klassisch: STT, LLM, TTS

Die meisten Plattformen arbeiten bis heute mit drei Modellen hintereinander:

| Baustein | Aufgabe |
|---|---|
| STT (Speech-to-Text) | macht aus der Sprache des Anrufers Text |
| LLM (Sprachmodell) | entscheidet, was geantwortet wird, und ruft Werkzeuge auf |
| TTS (Text-to-Speech) | spricht die Antwort |
| Plattformgebühr | wenn du einen fertigen Dienst wie ElevenLabs, Vapi, Retell oder Fonio nutzt |
| Telefonie | Nummer und Minuten ins Telefonnetz |

Formel: **Preis pro Minute = STT + LLM + TTS + Plattform + Telefonie.** Um auf 10 bis 15 Cent zu kommen, nutzen viele
Anbieter dabei günstige Sprachmodelle aus der Flash-Klasse.

### Speech-to-Speech

Ein Speech-to-Speech-Modell hört und spricht in einem einzigen Modell, ohne Umweg über Text.

| Modell | Preis pro Minute | Hinweis |
|---|---|---|
| GPT Realtime | 0,345 $ | nur Modell, bei Retell zzgl. 0,055 $ Voice-Infrastruktur und Telefonie |
| GPT Realtime 2 und 2.1 | je 0,38 $ | wie oben |
| GPT Realtime 2.1 mini | 0,07 $ | |
| GPT-Live (`gpt-live-1`) | 0,05 $ | sekundengenau, nur Sprachebene. Denkmodell und Werkzeuge kommen extra dazu |

Formel: **Preis pro Minute = Sprachmodell + Denkmodell + Telefonie** (plus Plattform, falls du eine nutzt).

GPT-Realtime war mit rund 35 bis 38 Cent pro Minute allein immer zu teuer. Seit dem 10. September 2026 gibt es
GPT-Live im API für 5 Cent pro Minute. Das ist der Grund, warum sich Speech-to-Speech jetzt rechnet.

### Die Denkebene: GPT-6 Luna

GPT-Live delegiert alles, was nachgeschlagen oder entschieden werden muss, an ein zweites Modell. Wir nutzen dafür
GPT-6 Luna mit Medium Reasoning Effort.

| Größe | Wert |
|---|---|
| Input | 0,10 $ pro 1 Mio. Token |
| Gecachter Input | 0,01 $ pro 1 Mio. Token |
| Output | 0,50 $ pro 1 Mio. Token |

So kommen wir auf 0,2 bis 0,4 Cent pro Minute. Das ist eine eigene Rechnung mit diesen Annahmen:

| Annahme | Wert |
|---|---|
| Antworten pro Minute | ca. 5 |
| Kontext pro Antwort | ca. 5.000 Token, davon 80 % gecacht (untere Grenze) oder ohne Cache (obere Grenze) |
| Output pro Antwort inkl. Reasoning | ca. 560 Token |

Formel: **Kosten pro Minute = Antworten × (Kontext × Inputpreis + Output × Outputpreis)**. Setz deine eigenen Werte ein,
denn lange Prompts und viele Werkzeugaufrufe erhöhen den Kontext deutlich.

## Was unsere Anrufe gekostet haben

| Was | Kosten |
|---|---|
| Buchungsanruf im Hotel mit GPT-Live und Computer Use | 0,22 bis 0,30 $, fast alles Gesprächszeit |
| Ein Auftrag Computer Use mit gpt-6-luna | rund 1 Cent |
| Simulierter Testanruf mit Video und automatischer Prüfung | 0,30 bis 0,50 $ |
| Deutsch-Test von gpt-live-1 | ein paar Cent |

## Kosten im Griff behalten

- **Budget mit Warnung** bei jedem Anbieter einrichten, bei uns ab 20 € im Monat.
- **Minutenkontingent je Person** auf einer Trainingsplattform, denn Echtzeit-Sprache kostet pro Minute.
- **Lass dir die Kosten vorher schätzen.** In den Anleitungen fragt Claude vor jedem Kauf oder Deploy nach Preis und
  Region.

## Ausblick

Leos Prognose im Video: Bis Ende 2027 bekommst du ein Modell in GPT-Live-Qualität zu einem Zehntel des Preises, also
etwa 0,5 Cent pro Minute. Dann verdient nicht mehr, wer Minuten weiterverkauft, sondern wer den Agenten an die Systeme
eines Unternehmens anbindet.

Quellen zu allen Preisen: [`quellen.md`](quellen.md), Fußnoten 13 bis 16.
