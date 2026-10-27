# Best Practices für Voice Agents

Was wir beim Bauen und Testen der fünf Use Cases gelernt haben. Zu jeder Regel steht die Messung oder der Fehler, der
uns darauf gebracht hat. Alle Werte stammen aus unseren Testläufen im Oktober 2026 und sind Stichproben, keine
Studien.

## Inhalt

1. [Architektur](#1-architektur)
2. [Die KI redet, der Code entscheidet](#2-die-ki-redet-der-code-entscheidet)
3. [Die Stimme prompten](#3-die-stimme-prompten)
4. [Zahlen und Daten liefert der Code in Worten](#4-zahlen-und-daten-liefert-der-code-in-worten)
5. [Werkzeuge vor und nach dem Gespräch](#5-werkzeuge-vor-und-nach-dem-gespräch)
6. [Pre-Call-Webhooks](#6-pre-call-webhooks)
7. [Testen mit Quoten statt Einzeltests](#7-testen-mit-quoten-statt-einzeltests)
8. [Eine Änderung pro Version](#8-eine-änderung-pro-version)
9. [Self-Learning nur mit Freigabe](#9-self-learning-nur-mit-freigabe)
10. [Telefonie-Fallen](#10-telefonie-fallen)
11. [Computer Use und Software ohne Schnittstelle](#11-computer-use-und-software-ohne-schnittstelle)
12. [Arbeiten mit Claude Code](#12-arbeiten-mit-claude-code)

## 1. Architektur

**Schnelles Modell vorne, schweres hinten.** Für die Stimme zählt die Zeit bis zum ersten Ton. Deshalb spricht ein
schnelles Modell, und ein starkes Modell erledigt die Arbeit im Hintergrund.
- *Gemessen:* Bis zum ersten Ton dauerte es mit Gemini 3.5 Flash-Lite 1,7 Sekunden, mit Gemini 3.8 Flash 3,8 Sekunden.
  Die Arbeit im Hintergrund macht bei JARVIS Claude Haiku 5.5.
- Bei Speech-to-Speech gilt dasselbe Muster: gpt-live-1 führt das Gespräch, gpt-6-luna arbeitet als Backend. Im
  Deutsch-Test antwortete gpt-live-1 nach rund 0,4 Sekunden.

**Lange Aufgaben laufen im Hintergrund.** Der Agent bleibt ansprechbar und meldet sich in einer Gesprächspause mit
dem Ergebnis. Das Werkzeug meldet sofort eine Aufgaben-Nummer, die Arbeit läuft weiter, und der Code gibt das Ergebnis
später an den Agenten.
- *Gefunden:* Ein Ergebnis, das nur als Hintergrundwissen übergeben wurde, brachte den ElevenLabs-Agenten nicht zum
  Reden. Erst als der Code es als Nutzernachricht schickte, sobald beide kurz still waren, meldete er sich.

**Erst planen, dann ausführen.** Bei mehreren Aufgaben sagt der Agent den Plan an, und der Code führt ihn erst nach
einem „Ja“ aus. Danach prüfst du im echten System, ob alles dort steht.

**Der Agent als Code, nicht als Klick-Konfiguration.** Liegen Prompt und Werkzeuge als Dateien im Git, siehst du jede
Änderung als Diff, kannst sie testen und zurückdrehen.
- *Gefunden:* Die ElevenLabs CLI lädt immer alle Agents hoch, auch ohne Änderung, und ihr Probelauf zeigt keinen
  Inhalt. Deshalb vergleicht ein eigenes Skript vor jedem Hochladen die lokale Datei mit dem Stand auf der Plattform.

**Versionen festnageln.** Neue Werkzeuge ändern sich schnell. Wir haben die ElevenLabs CLI auf 1.4.0 und LiveKit Agents
auf 1.8.8 festgelegt, damit ein Update nichts kaputt macht.

**Eigene Wissensdatenbank, wenn Fakten exakt sein müssen.** Eine eingebaute Wissensbasis reicht für 10 bis 30 saubere
Infoseiten. Bei Preisen, Staffeln und Artikelnummern reicht sie nicht.
- *Gemessen:* Bei „120 Stück A-1042“ fand unsere eigene Datenbank den richtigen Staffelpreis, die
  ElevenLabs-Wissensbasis fand ihn nicht. Bei „Was ist A-2210?“ antwortete die Wissensbasis „gibt es nicht in unserem
  Sortiment“. Ohne nachträglich gestarteten Index erfand sie Preise, mit Index lieferte sie Preise fremder Produkte aus
  dem Block „Ähnliche Artikel“.
- Preise gehören als feste Datensätze in eine Tabelle. Für Text nimmst du Hybrid Search: Die Vektorsuche versteht
  „Halter für dicke Acrylplatten“, die Volltextsuche findet „A-1042“. Im Probelauf fand nur die Hybrid-Suche die
  Artikelnummer.

**Procedures statt vieler Agenten.** Jede Übergabe zwischen Agenten ist eine neue Fehlerquelle. Getrennte Spezialisten
lohnen sich erst ab drei klar getrennten Fachgebieten.

## 2. Die KI redet, der Code entscheidet

Alles, was sich berechnen lässt, gehört in den Code: Wochentage, Feiertage, Öffnungszeiten, Preise, Einstufungen,
Sperrlisten. Ein Sprachmodell rechnet so etwas nicht zuverlässig.

- *Gemessen:* Version 1 mit den Öffnungszeiten im Prompt sagte am Karfreitag 5 von 5 Mal „geöffnet“. Version 2 bekam
  den Status fertig vom Code und sagte 3 von 3 Mal richtig „geschlossen“. Nach Karfreitag nannte sie richtig Dienstag,
  weil der Code den Ostermontag kennt.
- **Lead-Score im Code.** Der Agent erfasst die Antworten per Werkzeug als feste Felder, die Regel steht im Code. So ist
  das Ergebnis von Lauf zu Lauf gleich.
- **Opt-out im Code.** Nach „Rufen Sie mich nie wieder an“ setzt der Code die Nummer sofort auf die Sperrliste. Der
  nächste Anruf wird verweigert, bevor das Modell überhaupt startet.
- **Feste Sätze als Audiodatei.** GPT-Live spricht feste Sätze nicht verlässlich wortgleich. Der KI-Hinweis am Anfang
  ist deshalb eine Aufnahme mit derselben Stimme.
- **Sperren gegen doppelte Aktionen.** Pro Anruf höchstens eine neue Buchung, und kein Auftrag läuft doppelt.
  *Gefunden:* Ein Anrufer fragte mitten in der Buchung „Hallo, sind Sie noch dran?“. Ohne Sperre hätte der Agent ein
  zweites Mal gebucht.
- **Was der Agent nicht sagen soll, bekommt er nicht.** *Gefunden:* Der Agent las trotz Verbot die Rückrufnummer vor.
  Jetzt bekommt er nur noch „Nummer bekannt: ja oder nein“.
- **Rufnummern lassen sich fälschen.** Bestelldaten nennt der Agent nur, wenn Bestellnummer und Postleitzahl
  zusammenpassen. Die Rufnummer reicht nur für die Begrüßung.

## 3. Die Stimme prompten

- **Kurze Antworten vorgeben.** In unserem Prompt steht „Höchstens zwei kurze Sätze pro Antwort.“
- **Kurze Begrüßung.** *Gemessen:* Eine kurze Begrüßung mit KI-Hinweis lief in 14 von 16 Gesprächen sauber weiter,
  eine doppelt so lange nur in 8 von 16.
- **Telefonnummern Ziffer für Ziffer** in Zweiergruppen, E-Mail-Adressen buchstabiert zurücklesen.
- **Keine Füllwörter fordern.** Füllwörter klingen natürlich, schaden aber bei Datum, Zahlen, E-Mail oder einem Nein.
  Im Prompt steht „Füge selbst keine Füllwörter wie ‚ähm‘, ‚äh‘ oder ‚also‘ hinzu.“ GPT-Live klingt auch so menschlich.
  Kurze Hörersignale wie „mhm“ sind erlaubt.
- **Reasoning auf minimal.** *Gefunden:* Das Modell las einmal seinen Denktext vor.
- **Audio-Tags abschalten.** Regieanweisungen für die Stimme verschmutzten das Transkript.
- **Keine Werkzeugnamen im Ablauf.** *Gefunden:* Der Agent sprach einmal „end_call“ laut aus.
- **Nichts zusagen, bevor das System geantwortet hat.** *Gefunden:* Eine Agentin sagte „es sind noch Termine frei“, bevor
  sie nachgesehen hatte. Seitdem steht im Prompt, dass freie Zeiten nur aus dem System kommen.
- **Überbrückungssatz vor jeder Suche,** zum Beispiel „Moment, ich schaue nach“.
- **Stimme gestalten:** Die Beschreibung beginnt mit Sprache und Region, sonst spricht die Stimme mit Akzent. Keine
  Effektwörter wie „phone“ oder „radio“, die bauen echtes Rauschen ein. Ein längerer, passender Vorschautext ergibt eine
  stabilere Stimme. *Gefunden:* Eine Erzählstimme aus der Voice Library klang am Telefon zu sehr nach KI.
- **Jede neue Stimme braucht einen echten Testanruf.** Textszenarien prüfen den Klang nicht.

## 4. Zahlen und Daten liefert der Code in Worten

Datum, Uhrzeit, Preise und Nummern gibt der Code fertig ausgeschrieben an den Agenten, zum Beispiel „Dienstag, den
siebten April, ab sieben Uhr dreißig“.

- *Gefunden:* Aus „7. April“ wurde „siebenundzwanzigsten April“.
- *Gefunden:* Eine Agentin sagte „587,20 Euro“ statt 568,20 Euro.
- Auch der Bestätigungssatz nach einer Buchung kommt fertig aus dem Code: „Ich habe Dienstag, siebten April, um acht
  Uhr fünfzig für Sie vorgemerkt.“

## 5. Werkzeuge vor und nach dem Gespräch

Jeder Werkzeugaufruf im Gespräch kostet Wartezeit. Lade vorher, was vor dem Anruf feststeht, prüfe im Gespräch nur, was
sich laufend ändert, und erzeuge Ticket, Mail und Auswertung nach dem Auflegen.

- *Bei uns:* Im Gespräch liefen nur zwei Werkzeuge, Terminsuche und Vormerken. Ticket und Mail-Vorschau entstanden nach
  dem Auflegen, fehlende Felder blieben „offen“.
- **Werkzeuge ohne Sprachmodell.** Antwort fertig zum Vorlesen, Ziel unter 700 Millisekunden. Unser Werkzeug für Preise
  antwortete in rund 0,2 Sekunden.
- **Nicht jede Verbesserung lohnt sich.** Ein Reranker hätte die Suchtreffer etwas besser sortiert, kostet aber rund 600
  Millisekunden. Bei 344 Produkten reichten Hybrid Search und SQL-Filter.
- *Gemessen:* Eine Antwort mit Suche dauerte rund 2 Sekunden statt 1,5. Deshalb sagt der Agent vorher sofort „Moment,
  ich schaue nach“.
- **Ein Wächter gegen leere Versprechen.** *Gefunden:* Die Agentin kündigte „ich schaue im System nach“ an, ohne die
  Aufgabe abzugeben. Jetzt stößt der Code nach 6 Sekunden nach. Nach jedem Ergebnis bekommt sie den Status „erledigt“
  zu genau diesem Auftrag, sonst gab sie ihn ein zweites Mal ab.
- **Data Collection nach dem Anruf** macht aus jedem Gespräch feste Felder wie Anliegen, Rückrufwunsch und offene Fragen.

## 6. Pre-Call-Webhooks

Ein Pre-Call-Webhook ist ein Aufruf an deinen Server, während es noch klingelt. Er liefert die Werte für genau dieses
Gespräch: Datum, Öffnungsstatus, Feiertag, wer anruft und eine Notiz zum letzten Anruf.

- **Kostet keine Gesprächszeit.** Ein Werkzeug „Kundenhistorie laden“ würde den ersten Satz verzögern, und das Modell
  vergisst manchmal, es aufzurufen.
- **Dynamische Prompts.** Der Prompt hat Platzhalter, die der Code füllt. Bei uns steht dort „Praxis-Status:
  {{oeffnungsstatus_satz}}“, und am Karfreitag wird daraus „Heute ist Karfreitag, die Praxis ist geschlossen.“ Ein Test
  prüft, dass Prompt und Funktion dieselben Namen nutzen.
- **Anrufer erkennen, aber vorsichtig.** Der Agent fragt zuerst „Spreche ich mit …?“ und nennt Termindaten erst nach der
  Bestätigung.
- **Ohne Telefonnummer testen:** Im Browser ruft ein kleiner Server vorher denselben Webhook mit einer Test-Rufnummer
  auf.

## 7. Testen mit Quoten statt Einzeltests

Ein Sprachmodell antwortet nicht jedes Mal gleich. Ein einzelner Testanruf zeigt nur, dass es einmal geklappt hat.

- *Gemessen:* Dieselbe Konfiguration lief mittags 120 von 120 Mal richtig und abends 101 von 120 Mal.
- *Gefunden:* Erst wiederholte simulierte Anrufe deckten drei Fehler auf: den falschen Preis, die angekündigte, aber
  nicht ausgeführte Suche und die doppelte Abgabe nach einem fertigen Ergebnis.
- **Testfälle mit Bestehensbedingung.** Beispiel: Der Anrufer sagt „Haben Sie morgen früh um neun noch was frei?“
  Bestanden ist der Fall, wenn der Agent keine Uhrzeit zusagt, ohne vorher nachzusehen. In jedes Abnahmekriterium
  gehört der genaue Sollwert, zum Beispiel die vollständige Ziffernfolge einer Rückrufnummer.
- **Eingebaute Erfolgsquoten nachzählen.** *Gemessen:* Bei einem Kunden meldete die Erfolgsquote der Plattform 83 Prozent,
  nachgezählt waren es rund 54. Auf der Eval-Plattform gaben die eingebauten Kriterien fast perfekte 0,97, obwohl der
  Abschlusssatz in 8 von 8 Gesprächen fehlte.
- **Jedes echte Fehlgespräch wird ein neuer Test.**
- **Ton testen.** Textszenarien prüfen weder Stimme noch Pausen noch Hörersignale. Mehr dazu in
  [`evaluation.md`](evaluation.md).

## 8. Eine Änderung pro Version

Nur wenn sich genau eine Sache ändert, weißt du, was gewirkt hat.

- *Gemessen:* Eine zweite Version mit Procedures bestand 24 von 30 Tests, die erste 28 von 30. Sie wurde nicht übernommen.
- *Gemessen:* Version 1.2 übernahm einen Verbesserungsvorschlag wörtlich. Der Abschlusssatz kam danach in 4 von 8 und im
  nächsten Lauf nur in 1 von 8 Gesprächen. Der Vorschlag hat also kaum gewirkt. Acht Gespräche je Version sind eine Stichprobe, kein Beweis.
- **Neue Versionen erst auf einen kleinen Teil der Anrufe,** bei uns 5 oder 15 Prozent. Achtung: Ein Merge geht bei
  manchen Plattformen sofort live, auch ohne bestandene Tests.

## 9. Self-Learning nur mit Freigabe

Ein Agent darf aus seinen Gesprächen lernen, aber er ändert sich erst, wenn ein Mensch Ja sagt.

- **Wissenslücken:** Unbeantwortete Fragen werden wöchentlich gebündelt und nach Häufigkeit sortiert. Ein Mensch schreibt
  die Antwort, sie geht als FAQ ins Wissen, und aus dem Gespräch wird ein neuer Test.
- **Prompt-Vorschläge:** Ein Modell findet die häufigste Fehlerursache und schlägt genau eine Änderung vor. Getestet wird
  sie mit Simulationen aus alten Fehlgesprächen, danach wartet sie mit Diff und Belegen auf Freigabe.
- **Gesperrte Abschnitte.** Rolle und Regeln im Prompt darf die Lernschleife nie ändern, nur freigegebene Abschnitte wie
  Einwände und Ton.
- **Notizen sind nur Information.** Eine Notiz pro Lead für den nächsten Anruf darf den Agenten nicht umprogrammieren,
  sonst kann jeder Angerufene über ein Gespräch den Prompt verändern.
- **Die richtige Zielgröße wählen.** Wir messen „Umfrage abgeschlossen“ statt „heißer Lead“. *Gerechnet:* Für einen
  Anstieg der Heiß-Quote von 10 auf 13 Prozent bräuchte man rund 1.800 Gespräche je Version. Bei 500 Anrufen im Monat
  ist das nicht messbar.
- **Automatisch zurück bei Schaden.** Thompson Sampling verteilt die Anrufe nach Erfolg, und bei mehr Opt-outs geht es
  automatisch auf die alte Version zurück.
- **Der Judge braucht einen Menschen als Maßstab.** Bewerte 20 Gespräche selbst und miss, wie oft der Judge mit dir
  übereinstimmt. Feste Fehlerkategorien mit Ja oder Nein und Zitat sind verlässlicher als Noten von 1 bis 10. Pflichtregeln
  prüft der Code, denn Sprachmodelle übersehen als Prüfer ausgerechnet Sicherheitsfehler.

## 10. Telefonie-Fallen

- **Echo.** Ohne Kopfhörer hört der Agent sich selbst über die Lautsprecher und unterbricht sich. Beim Testen am selben
  Rechner immer Kopfhörer tragen.
- **Expliziter VAD** (Voice Activity Detection, erkennt, wann jemand spricht). Ohne ihn reagierte GPT-Live nicht
  zuverlässig auf Unterbrechungen.
- **„mhm“ ist keine Unterbrechung.** Im deutschen Telefonat ist es ständig zu hören. *Öffentlicher Test:* 9 von 11
  Sprachmodellen brachen dabei fast immer ab, obwohl es nur „weiter“ hieß.
- **Überlappung.** *Gemessen:* Im Voice Lab redete der Testanrufer in bis zu 10,6 Prozent der Sprechzeit des Agenten
  hinein. Mit einem Rederecht-Gate gab es danach 4 Läufe ohne Überlappung.
- **Kalter Start.** Ein kalter Worker braucht beim ersten Anruf mehrere Sekunden, und in dieser Stille legt der
  Angerufene auf. Worker vorwärmen.
- **Wer begrüßt?** Bei ausgehenden Anrufen wartet der Agent auf das „Hallo“ des Angerufenen. Bei eingehenden Anrufen
  begrüßt gpt-live-1 nicht von selbst, der Server löst die Begrüßung aus.
- **Fester Text an GPT-Live vorbei.** Spiel die Audiodatei am Modell vorbei ab, schalte dabei den Eingang stumm und stoß
  das Modell danach an, sonst schweigt es.
- **Mailbox.** Ein LiveKit-Nutzer mit tausenden Anrufen am Tag meldet rund 30 Prozent Mailbox oder automatische
  Anrufprüfung. Dort nichts aufsprechen oder nur das Anliegen in einem Satz nennen.
- **Spam-Markierung.** Mehr als 50 Anrufe pro Nummer und Tag markieren die Netzbetreiber schnell als Spam.
- **Rufnummer aus dem Ausland.** Kommt ein Anruf mit deutscher Nummer über ein ausländisches Netz, unterdrücken deutsche
  Netze die Nummer (§ 120 TKG). Teste deshalb bei Telekom, Vodafone und O2, ob die Nummer angezeigt wird.
- **Regulatory Bundle.** Deutsche Nummern bei Twilio brauchen ein genehmigtes Regulatory Bundle, das einige Tage dauert.
  Früh beantragen.
- **Gleichzeitige Gespräche begrenzen.** Eine Begrenzung in der Warteschlange reicht nicht, weil das Gespräch nach dem
  Wählen weiterläuft. Erst ein Slot, den das Ergebnis wieder freigibt, begrenzt die echten Gespräche.
- **Stiller Ausfall.** Ein Outbound-System ruft bei einem Fehler einfach niemanden mehr an. Ein Alarm „Termine fällig,
  aber kein Anruf“ fängt das ab.
- **Logs ohne Telefonnummern.** Telefonnummern sind personenbezogene Daten. Und schalte Funktionen ab, die Audio der
  Angerufenen speichern, wenn du sie nicht brauchst.

## 11. Computer Use und Software ohne Schnittstelle

**Computer Use** (ein Modell bedient eine Software wie ein Mensch, nur über Screenshots, Maus und Tastatur):

- *Gemessen:* Eine Buchung dauerte 35 bis 90 Sekunden, Umbuchen 20 bis 37, Stornieren 9 bis 15. Ein Auftrag kostete mit
  gpt-6-luna rund 1 Cent.
- **Erst allein testen,** bevor die Stimme dazukommt. So siehst du, ob ein Fehler am Klicken oder am Gespräch liegt.
- **Kein Zugriff auf den Seitencode,** denn genau den gibt es bei fremder Software nicht.
- **Zwischenansagen,** solange die Software arbeitet.

**Software für Agenten lesbar machen.** *Gemessen:* Der erste Lauf brauchte 22 Schritte, nach den Änderungen waren es 8
Schritte in 35 Sekunden. Die Regeln:
- keine nativen Auswahllisten und Datums-Popups, sie sind im Screenshot unsichtbar (das Personenfeld wurde sechsmal
  angeklickt),
- nichts nur per Hover,
- keine Ein-Tasten-Kürzel, sie lösten beim Tippen Seitenwechsel aus,
- Strg+A markiert alles (unter macOS sprang es an den Zeilenanfang, Daten wurden doppelt getippt),
- das Layout springt nicht,
- Erfolg steht groß im Bild.

**Reverse Engineering** (die interne Schnittstelle einer Web-App nachbauen):
- *Gemessen:* Ein Aufruf über die nachgebaute Schnittstelle dauerte 0,2 bis 1 Sekunde. Per Klicken brauchte dieselbe
  Aufgabe 35 Sekunden.
- **Mitschnitt bereinigen.** Entferne aus der HAR-Datei alle Cookies, Authorization- und CSRF-Werte, bevor du mit ihr
  arbeitest.
- **Erst die Doku, dann der Code.** Ein Missverständnis in einer Tabelle zu korrigieren kostet eine Minute, im fertigen
  Client eine Stunde. Markier, was nur vermutet ist.
- **Nachmachen, was die App still richtig macht.** *Gefunden:* Ohne den Header `Accept: application/json` kam eine
  HTML-Seite zurück. Der Kalender zeigte Termine in der Zeitzone des Browsers, deshalb rechnet der Client fest in der
  Zeitzone der Praxis. Jeder Patient hatte zwei verschiedene IDs. Nach rund 75 Sekunden ohne Anfrage trennte der Server
  die Verbindung.
- **Lesende Anfragen wiederholen, schreibende nie.** Eine wiederholte Buchung wäre ein doppelter Termin.
- **AGB prüfen.** Viele Programme verbieten Reverse Engineering und Bots ausdrücklich.

## 12. Arbeiten mit Claude Code

- **Plan und Regeln zuerst.** Prompt 1 erzeugt `CLAUDE.md` und `docs/architektur.md`, gebaut wird erst danach. Siehe
  [`00-vorbereitung`](../00-vorbereitung/).
- **Erst recherchieren, dann bauen.** *Gefunden:* Das alte Werkzeug `computer-use-preview` war schon abgeschaltet, und
  gpt-live-1 lief nicht über das bekannte Muster aus dem Agents SDK. Lass Claude die aktuelle Doku prüfen und mit Links
  belegen.
- **Kleine Tests vor großen Umbauten.** Deutsch stand bei gpt-live-1 nicht in der Doku. Ein Test für ein paar Cent
  zeigte, dass es wortgenau verstand, und sparte einen möglichen Umbau.
- **Diff vor jedem Hochladen,** egal ob ElevenLabs-Agent oder Cloud-Infrastruktur.
- **Keys nur in der `.env`,** nie im Chat. Ein Key, der doch einmal im Chat stand, wird erneuert.
