# Evaluation: Ist die neue Version wirklich besser?

Ein Prompt, der sich gut anfühlt, ist kein Beleg. Erst die Messung zeigt, ob eine Änderung hilft, und erst dann
entscheidest du über die Freigabe. Diese Seite zeigt, wie wir unsere Voice Agents messen.

## 1. Benchmarks nur zur Vorauswahl

Öffentliche Benchmarks (standardisierte Vergleichstests) zeigen einen Trend, aber nicht, ob dein Agent am Telefon
deiner Praxis oder deines Shops funktioniert.

- **Nur zur Vorauswahl lesen.** Sie helfen dir, zwei oder drei Kandidaten auszuwählen.
- **Text- und Sprachwerte getrennt ansehen.** Ein Modell, das im Textchat glänzt, ist am Telefon oft deutlich
  schwächer. Im τ-Voice-Benchmark (März 2026) erreichte GPT-5 im Texttest 85 Prozent. Die untersuchten Voice Agents
  erreichten bei sauberem Audio nur 31 bis 51 Prozent.
- **Die Kandidaten mit eigenen Fällen testen.** Das ist der Rest dieser Seite.

Welche Benchmarks wir im Video zitieren, steht in [`quellen.md`](quellen.md).

## 2. Erst festlegen, was „gut“ heißt

Bevor du misst, schreibst du auf, woran du ein gutes Gespräch erkennst.

- **Kriterien mit Gewicht.** Zum Beispiel: Anliegen richtig erkannt, Termin korrekt vorgemerkt, Daten richtig
  zurückgelesen, freundlicher Abschluss. Jedes Kriterium bekommt ein Gewicht, die Summe ergibt einen Score von 0 bis 100.
- **Schwellen.** Bei uns gilt grün ab 80, gelb ab 60, darunter rot.
- **Harte Grenzen.** Manche Fehler wiegt kein gutes Kriterium auf, zum Beispiel ein zugesagter Termin, den es nicht gibt,
  oder eine erfundene Öffnungszeit. Ein harter Fehler deckelt den Score, egal wie gut der Rest war.
- **Feste Fehlerkategorien mit Ja oder Nein und Zitat** sind verlässlicher als Noten von 1 bis 10.

## 3. Feste Testanrufer

Jede Version läuft gegen dieselben Testanrufer. Ein Testanrufer ist eine Persona (eine feste Rolle für ein Sprachmodell)
mit Anliegen, Persönlichkeit und Bestehensbedingung. Bei uns sind es acht, von einfach bis Grenzfall.

Zwei normale Fälle aus unserem Praxis-Agenten:

| Testanrufer | Bestanden, wenn |
|---|---|
| Eine Patientin will vormittags Krankengymnastik. | Der Agent prüft den Kalender, merkt einen Termin vor und bestätigt ihn richtig. |
| Eine Patientin will in der Mittagspause sofort das Team sprechen. | Der Agent nennt die Pause, sagt „ab 13:30“ und bietet einen Rückruf an. |

Dazu schwere Fälle und Grenzfälle, an denen Agenten typischerweise scheitern:

- „Ich will sofort eine Lösung.“
- „Ruft heute noch jemand an?“
- „Das Programm spinnt.“
- „Ich rede nicht mit einer KI.“
- Der Anrufer korrigiert seine Daten, während der Agent sie zurückliest.

Für jeden dieser Fälle schreibst du eine eigene Bestehensbedingung mit dem genauen Sollwert.

Wichtig: Leg dir ein Prüfset an, das du beim Bauen nicht anschaust. Sonst optimierst du den Prompt auf genau diese
Fälle.

## 4. Auf drei Ebenen prüfen

1. **Code prüft die Pflichtregeln.** Steht der Termin wirklich im Kalender? Kam der KI-Hinweis? Wurde die Nummer
   gesperrt? Das braucht kein Sprachmodell, und Sprachmodelle übersehen als Prüfer ausgerechnet solche Fehler.
2. **Ein Judge bewertet den Text.** Ein Judge ist ein Sprachmodell, das prüft statt spricht. Er bewertet jedes Kriterium
   mit einem wörtlichen Zitat als Beleg und sollte aus einer anderen Modellfamilie kommen als der Agent. Bei uns bewertet
   gpt-6-luna. Gleich den Judge vorher mit einem Menschen ab: Bewerte 20 Gespräche selbst und miss, wie oft er mit dir
   übereinstimmt.
3. **Ein Test im Ton.** Mehr dazu im nächsten Abschnitt.

**Verlass dich nicht auf eingebaute Kriterien.** In unseren Läufen gaben die eingebauten Kriterien der Plattform
Version 1.1 fast perfekte 0,97, obwohl der Abschlusssatz in 8 von 8 Gesprächen fehlte. Erst unsere eigenen Kriterien
haben das gezeigt.

## 5. Im Ton testen

Stille, Überlappung und Wartezeit sieht man nur im echten Audio. Textsimulationen prüfen weder Stimme noch Pausen noch
Hörersignale.

- **Ein KI-Anrufer ruft den Agenten im Ton an.** Zwei KIs telefonieren miteinander, der Testanrufer spricht mit echter
  Stimme.
- **Beide Seiten auf getrennten Spuren aufnehmen.** So misst du, wer wann gesprochen hat.
- **Stille und Überlappung messen.** Eine lange Stille nach einem Werkzeugaufruf ist auf der Spur sofort zu sehen.
- **Rederecht-Gate.** Das Gate hält den Testanrufer zurück, bis der Agent ausgeredet hat. Ohne Gate redete unser
  Testanrufer in bis zu 10,6 Prozent der Sprechzeit des Agenten hinein, und du misst dann die Unhöflichkeit des
  Testanrufers statt die Qualität des Agenten. Mit Gate gab es danach 4 Läufe ohne Überlappung.
- **Ohne KI-Bewerter prüfen, wo es geht.** Unser Ton-Test prüft über den Kalender, ob der Termin wirklich eingetragen
  ist, und über Messwerte wie Dauer, Antwortzeit und Werkzeugaufrufe.

## 6. Eine Änderung pro Version

- **Genau eine Änderung machen.** Nur so ist messbar, was gewirkt hat.
- **Dieselben Testanrufer laufen lassen.**
- **Mehrere Läufe vergleichen.** Ein Sprachmodell antwortet nicht jedes Mal gleich.
- **Versionen nebeneinander legen.** Gleiches Modell, nur der Prompt ist anders, und du siehst die geänderten Zeilen.

## 7. Unsere Zahlen

In den aufgezeichneten Läufen vom 15.10. liefen drei Versionen des Praxis-Agenten gegen dieselben acht Testanrufer:

| Version | Score | Was sich geändert hat |
|---|---|---|
| v1.0 | 58 | Ausgangsversion |
| v1.1 | 85 | überarbeiteter Prompt, gleiches Modell |
| v1.2 | 87 | ein Verbesserungsvorschlag wörtlich übernommen |

Der Sprung von v1.0 auf v1.1 ist deutlich. Der Schritt auf v1.2 ist es nicht: Der übernommene Vorschlag sollte den
fehlenden Abschlusssatz beheben, der kam danach aber nur in 4 von 8 und im nächsten Lauf in 1 von 8 Gesprächen. Acht
Gespräche je Version sind eine Stichprobe, kein Beweis.

## 8. Verbesserungen vorschlagen lassen, aber selbst entscheiden

Aus den Bewertungen kann ein Modell Verbesserungen ableiten, etwa „Abschlusssatz fehlt in 8 von 8 Gesprächen“. Jeder
Vorschlag bekommt einen Status: offen, umgesetzt oder verworfen. Die Plattform ändert nichts selbst, ein Mensch
entscheidet. Danach wird neu gemessen. Mehr zur Lernschleife in
[`best-practices.md`](best-practices.md#9-self-learning-nur-mit-freigabe).

## Checkliste

- [ ] Kriterien mit Gewicht, Schwellen und harten Grenzen aufgeschrieben
- [ ] Feste Testanrufer mit Bestehensbedingung angelegt, Prüfset gesperrt
- [ ] Pflichtregeln prüft der Code
- [ ] Judge aus einer anderen Modellfamilie, mit Zitat, abgeglichen mit einem Menschen
- [ ] Ton-Test mit getrennten Spuren und Rederecht-Gate
- [ ] Eine Änderung pro Version, mehrere Läufe je Version
- [ ] Freigabe nur durch einen Menschen
