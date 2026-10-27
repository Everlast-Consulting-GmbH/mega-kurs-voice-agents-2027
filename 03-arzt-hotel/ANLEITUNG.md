# Anleitung: Arzt und Hotel

Voice Agents für Software ohne Schnittstelle, Schritt für Schritt mit Claude Code. Du baust alles selbst in einem
leeren Projektordner. Fertig mitgeliefert ist nur die Hotelsoftware in [`hotel-demo/`](hotel-demo/).

Stack: OpenAI gpt-live-1 und gpt-6-luna, Python, Playwright. Stand: Oktober 2026.

## Inhalt

- [Vorbereitung](#vorbereitung)
- [Teil A: Hotel, Lena bucht per Computer Use](#teil-a-hotel-lena-bucht-per-computer-use)
- [Teil B: Arztpraxis, Sophie bucht über die nachgebaute Schnittstelle](#teil-b-arztpraxis-sophie-bucht-über-die-nachgebaute-schnittstelle)
- [Prompt 10 bis 12: Eigene Praxissoftware, Flowcharts, Abschluss-Check](#prompt-10-zusatz-eigene-praxissoftware-programmieren)
- [So zeigst du es](#so-zeigst-du-es)
- [So testest du es: Demo-Abläufe](#so-testest-du-es-demo-abläufe)
- [Optional: Echte Telefonnummer](#optional-echte-telefonnummer)
- [Regeln für Software, die ein Agent bedienen soll](#regeln-für-software-die-ein-agent-bedienen-soll)

## Konten, die du brauchst

| Konto | Wofür | Hinweis |
|---|---|---|
| [OpenAI Platform](https://platform.openai.com) | Stimme (gpt-live-1), Backend und Computer Use (gpt-6-luna) | Beide Modelle müssen für dein Konto freigeschaltet sein. Prompt „Konten einrichten“ prüft das |
| Testversion einer Praxissoftware | Nur für Teil B (Arzt) | Auswahl mit Prompt 6, anlegen in Schritt 5 |
| [Twilio](https://www.twilio.com) | Optional: echte Telefonnummer | Nur für den optionalen Schritt am Ende |

## Vorbereitung

### 0. Claude Code und Homebrew

Wie du Claude Code und Homebrew installierst, steht in [`../00-vorbereitung/README.md`](../00-vorbereitung/README.md).
Das gilt für alle Use Cases und wird hier nicht wiederholt.

### 1. Projektordner anlegen und die Hotelsoftware hineinlegen

Leg im Finder an einer beliebigen Stelle einen neuen, leeren Ordner an. Hinein kommt nur der Ordner `hotel-demo/`
aus diesem Repo. Du hast drei Wege, ihn zu bekommen:

- Ganzes Repo auf GitHub über „Code“ und „Download ZIP“ herunterladen, entpacken und `03-arzt-hotel/hotel-demo/`
  in deinen Projektordner ziehen.
- Mit git: Repo klonen und den Ordner kopieren.
- Nur diesen einen Ordner holen, im Terminal in deinem Projektordner:

```bash
npx degit Everlast-Consulting-GmbH/mega-kurs-voice-agents-2027/03-arzt-hotel/hotel-demo hotel-demo
```


Dann im Terminal `cd` und ein Leerzeichen tippen, den Projektordner aus dem Finder ins Fenster ziehen, Enter drücken
und `claude` starten. Die Frage, ob Claude dem Ordner vertrauen darf, bestätigen.

### 2. Werkzeuge von Claude installieren lassen

Websites der Werkzeuge: [Python](https://www.python.org/downloads/), [uv](https://docs.astral.sh/uv/),
[ffmpeg](https://ffmpeg.org), [Playwright](https://playwright.dev/python/)

**Prompt: Werkzeuge installieren**

```text
Installiere mir Python 3.12, uv und ffmpeg. Leg in diesem Ordner eine Python-Umgebung mit uv an und installier darin openai, openai-agents, playwright, aiohttp und requests. Lade danach den Chromium-Browser für Playwright. Prüf mit den Versionsbefehlen, ob alles läuft, und sag mir, was fehlt. Mach danach in diesem Ordner git init.
```

Zum Nachschauen, falls etwas hakt:

```bash
brew install python@3.12 uv ffmpeg
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python openai openai-agents playwright aiohttp requests
.venv/bin/python -m playwright install chromium
git init
```

**Unser Ergebnis:** Bei uns liefen openai 3.31.0, openai-agents 0.23.1 und playwright 1.64.0.

### 3. Konten einrichten lassen

**Prompt: Konten einrichten**

```text
Leg im Projektordner eine .env an und trag sie in die .gitignore ein. Schreib diese Variablen mit leerem Wert hinein: OPENAI_API_KEY, PRAXIS_EMAIL und PRAXIS_PASSWORD.
- Öffne die Datei mit open -e .env und sag mir, wo ich den OpenAI-Key auf platform.openai.com finde.
- Warte, bis ich gespeichert habe. Nutz die Werte danach nur über Variablen aus der .env und gib nie einen im Chat aus.
Prüf dann mit einer kleinen Anfrage, ob der OpenAI-Key funktioniert und ob die Modelle gpt-live-1 und gpt-6-luna für mein Konto freigeschaltet sind.
```

Eine Vorlage mit Kommentaren liegt unter [`.env.example`](.env.example). Den OpenAI-Key legst du auf der OpenAI
Platform unter „API keys“ an. E-Mail und Passwort für die Praxissoftware trägst du ein, sobald du in Schritt 5 das
Testkonto angelegt hast.

**Warum so:** Die `.env` schützt die Keys nicht vor Claude, Claude hat Zugriff auf den ganzen Ordner. Sie sorgt
dafür, dass Keys und Passwort nicht im Chatverlauf und nicht im Git landen. Wenn du dabei filmst oder deinen
Bildschirm teilst: Der Key ist beim Einfügen kurz sichtbar, erneuere ihn danach.

### 4. Hotelsoftware einmal selbst bedienen

Öffne `hotel-demo/index.html` per Doppelklick und buche einmal von Hand: oben „Neue Reservierung“, Anreise und
Abreise als TT.MM.JJJJ eintippen, „Verfügbarkeit prüfen“, einen Preis anklicken, Gast eintragen, „Buchung
bestätigen“. Es erscheint eine große Reservierungsnummer wie R-1651. Genau diesen Weg geht später der Agent. Danach
im Benutzermenü oben rechts „Demo-Daten zurücksetzen“.

Die Demo-Daten werden relativ zum heutigen Datum erzeugt, die Software ist also an jedem Tag gefüllt. Mehr dazu in
[`hotel-demo/README.md`](hotel-demo/README.md) und [`hotel-demo/CODE-ERKLAERUNG.md`](hotel-demo/CODE-ERKLAERUNG.md).

### 5. Testkonto in der Praxissoftware (nur für Teil B)

Leg bei der Praxissoftware, die du mit Prompt 6 ausgewählt hast, eine kostenlose Testversion an und bestätige die
E-Mail. Captcha und Bestätigungslink klickst immer du selbst. Dann:

- eine erfundene Praxis einrichten,
- acht erfundene Patienten mit Telefonnummern 555-01xx und E-Mails auf `@example.com` anlegen,
- bei jedem die E-Mail- und SMS-Erinnerungen ausschalten,
- sechs bis zehn Termine in der nächsten Woche eintragen.

Das Konto darf keine Zwei-Faktor-Anmeldung haben, sonst klappt der Login aus dem Code nicht. Trag E-Mail und
Passwort danach selbst in die `.env` ein.

Dann Prompt 1 im Plan-Modus schicken (Shift+Tab). Danach Prompt für Prompt, immer erst weiter, wenn das Ergebnis
passt.

---

## Teil A: Hotel, Lena bucht per Computer Use

Die Hotelsoftware hat keine Schnittstelle. Lena führt das Gespräch, ein zweites Modell bedient die Software wie ein
Mensch vor dem Bildschirm.

### Prompt 1: Plan und Regeln

```text
Wir bauen zwei deutschsprachige KI-Telefonagenten für Software ohne offene Schnittstelle. Lena nimmt Anrufe für das Hotel Seeblick Rendsburg an und bucht in unserer Hotelsoftware hotel-demo/index.html per Computer Use, also nur über Screenshots, Maus und Tastatur. Sophie nimmt Anrufe für eine Hausarztpraxis an und bucht in einer US-Praxissoftware (<DEINE_PRAXISSOFTWARE>, Auswahl in Prompt 6) über deren interne Web-Schnittstelle, die wir vorher selbst nachbauen.
Stack: OpenAI gpt-live-1 als Stimme, gpt-6-luna als Backend und für Computer Use, Python mit der Umgebung in .venv, Playwright. Recherchier zuerst in der aktuellen OpenAI-Doku, wie gpt-live-1, die Delegation an ein Backend-Modell und das Werkzeug für Computer Use heute funktionieren, und belege es mit Links.
Regeln für die CLAUDE.md:
- Keys und Passwörter nur in der .env, nie im Chat, nie im Git.
- Nur Fake-Daten. In der Praxissoftware nichts löschen und keine Benachrichtigungen an Patienten.
- Captchas, Bestätigungslinks und Passwörter im Browser übernimmt immer ein Mensch.
- Preise, freie Zimmer und freie Termine kommen nur aus der Software, nie vom Modell.
- Jeder Teil wird erst allein getestet, bevor er mit dem nächsten verbunden wird.
Halte Architektur und Regeln in docs/architektur.md fest und ergänze die Datei bei jedem Schritt. Mach dann einen Plan in Schritten. Nach meinem OK schreibst du nur die CLAUDE.md und docs/architektur.md, gebaut wird noch nichts.
```

**Warum so:** Die Technik ändert sich gerade im Monatstakt. Bei uns war das alte Werkzeug `computer-use-preview`
schon abgeschaltet, und gpt-live-1 läuft nicht über `RealtimeAgent` aus dem Agents SDK, sondern braucht ein eigenes
Muster. Deshalb erst recherchieren, dann bauen. Die Regeln in der CLAUDE.md gelten in jedem Schritt, du musst sie
nicht in jeden Prompt schreiben.

### Prompt 2: Deutsch-Test der Stimme

```text
Bevor wir bauen, teste, ob gpt-live-1 gut Deutsch versteht und spricht. Erzeug einen kurzen deutschen Anrufersatz mit Datum per Sprachausgabe, schick ihn in eine gpt-live-1-Sitzung und vergleich, was das Modell verstanden und geantwortet hat. Lass die Antwort zusätzlich von einem Transkriptionsmodell zurückschreiben. Miss die Zeit vom Ende des Satzes bis zum Beginn der Antwort und probier zwei Stimmen. Schreib das Ergebnis kurz in docs/deutsch-test.md.
```

**Unser Ergebnis:** gpt-live-1 hat den Anrufer wortgenau verstanden, auch die Datumsangaben, und nach rund
0,4 Sekunden geantwortet. Beide Stimmen, marin und cedar, klangen natürlich und ohne Akzent.

**Warum so:** Deutsch steht bei gpt-live-1 nicht in der Doku. Ein Test für ein paar Cent spart später einen
kompletten Umbau. Hätte er nicht geklappt, wäre gpt-realtime-2.1 der Ersatz gewesen. gpt-live-1 ist Vollduplex, hört
also weiter zu, während es spricht, und kostet 0,05 Dollar pro Minute.

### Prompt 3: Computer Use allein

```text
Bau einen Computer-Use-Agenten, der die Hotelsoftware hotel-demo/index.html bedient, mit dem OpenAI Agents SDK, dem Werkzeug für Computer Use und gpt-6-luna. Beachte:
- Ein sichtbares Chromium-Fenster über Playwright, 1280 mal 800 Pixel, das zwischen den Aufträgen offen bleibt.
- Der Agent sieht nur Screenshots und nutzt nur Maus und Tastatur. Kein Zugriff auf den Seitencode und nicht auf window.hotelApi.
- Ein Auftrag ist ein ganzer Satz mit allen Daten. Das Ergebnis ist ein kurzer Satz mit Reservierungsnummer und Preis oder mit dem Fehler.
- Aufruf von der Kommandozeile mit einem Auftrag. Mit --reset werden vorher die Demo-Daten zurückgesetzt.
Teste mit einer Neubuchung, einer Umbuchung und einer Stornierung. Zeig mir für jeden Lauf Dauer, Anzahl der Schritte und ob das Ergebnis in der Software stimmt.
```

**Unser Ergebnis:** Eine Buchung dauerte 35 bis 90 Sekunden, Umbuchen 20 bis 37, Stornieren 9 bis 15. Ein Auftrag
kostet mit gpt-6-luna rund 1 Cent.

**Warum so:** Computer Use erst allein testen, bevor die Stimme dazukommt. So siehst du, ob ein Fehler am Klicken
liegt oder am Gespräch. Der Agent bekommt bewusst keinen Zugriff auf den Seitencode, denn genau den gibt es bei
fremder Software nicht.

### Prompt 3a (Zusatz): Eigene Software für Agenten lesbar machen

Dieser Prompt ist für alle, die eigene Software haben. Unsere Hotelsoftware hat die Änderungen schon drin, deshalb
läuft der Agent sauber durch.

```text
Schau dir die Läufe aus dem letzten Schritt an. Wo hat der Agent doppelt getippt, mehrfach geklickt oder sich verirrt? Nenn mir für jede Stelle die Ursache in der Oberfläche und einen Vorschlag. Ändere die Software erst nach meinem OK und prüf danach mit einem echten Computer-Use-Lauf, nicht nur mit einem Test im Seitencode.
```

**Unser Ergebnis:** Der erste echte Lauf brauchte 22 Schritte, nach den Änderungen waren es 8 Schritte in
35 Sekunden.

**Warum so:** Was einen Menschen nicht stört, bremst den Agenten. Native Auswahllisten sind im Screenshot unsichtbar,
das Personenfeld wurde deshalb sechsmal angeklickt. Strg+A springt unter macOS an den Zeilenanfang, Daten wurden
doppelt getippt. Ein-Tasten-Kürzel lösten beim Tippen Seitenwechsel aus. Die Regeln stehen gesammelt am Ende dieser
Anleitung unter [Regeln für Software, die ein Agent bedienen soll](#regeln-für-software-die-ein-agent-bedienen-soll).

### Prompt 4: Lena, der Telefon-Agent

```text
Bau den Telefon-Agenten Lena für das Hotel Seeblick Rendsburg. Beachte:
- gpt-live-1 führt das Gespräch mit der Stimme marin und delegiert alles, was die Software betrifft, an gpt-6-luna als Backend. Das Backend ruft genau eine Funktion auf: hotel_software_bedienen mit einem vollständigen Auftrag. Die führt der Computer-Use-Agent aus Prompt 3 aus.
- Gesprächsführung: fehlende Daten erfragen, Telefonnummer Ziffer für Ziffer und E-Mail buchstabiert zurücklesen, vor dem Buchen zusammenfassen und fragen „Soll ich das so verbindlich buchen?“. Erst nach einem klaren Ja buchen.
- Während die Software arbeitet, kurze Zwischenansagen. Die Reservierungsnummer langsam ansagen und einmal wiederholen.
- Im Code: Kein Auftrag läuft doppelt, pro Anruf höchstens eine neue Buchung.
- Eine Anruf-Oberfläche im Browser mit Knopf „Anruf starten“, Live-Transkript, Status und der Aktion, die der Agent gerade in der Software macht. Die Hotelsoftware links, die Anruf-Oberfläche rechts daneben.
- Jeder Anruf wird mit Transkript und Werkzeugaufrufen in runs/ protokolliert.
Starte alles mit einem Befehl und sag mir, wann ich anrufen kann.
```

**Unser Ergebnis:** Ein Buchungsanruf kostete rund 0,22 bis 0,30 Dollar, fast alles davon Gesprächszeit.

**Warum so:** Die Stimme bleibt schnell und natürlich, die Arbeit macht ein zweites Modell im Hintergrund. Wir lassen
das Backend den Auftrag aus dem ganzen Gespräch formulieren. Bei der einfacheren Variante, in der der eigene Code das
Signal bekommt, fehlt der Auftragstext. Die Sperre im Code ist Pflicht: In unserem Test fragte der Anrufer mitten in
der Buchung „Hallo, sind Sie noch dran?“. Ohne Sperre hätte Lena ein zweites Mal gebucht. Beim Testen immer
Kopfhörer tragen, sonst hört Lena sich selbst über die Lautsprecher.

**So testest du es:** Kopfhörer auf, „Anruf starten“, Mikrofon erlauben. Lena meldet sich mit „Hotel Seeblick
Rendsburg, guten Tag, hier ist Lena. Wie kann ich Ihnen helfen?“ Frag nach einem Doppelzimmer für zwei Personen,
wähl eine Rate, nenn Name, Telefon und E-Mail und sag „Ja, bitte verbindlich buchen.“ Jetzt bewegt sich links die
Software von selbst, rechts steht „Agent bedient Hotelsoftware …“ mit der aktuellen Aktion. Am Ende suchst du die
Reservierung in der Software: Kanal „Voice Agent“, Preis und Zeitraum stimmen.

### Prompt 5: Simulierter Anruf und Prüfung

```text
Bau einen simulierten Anruf ohne Mikrofon. Ein zweites Modell spielt einen Gast, der ein Zimmer bucht, und spricht über eine Sprachausgabe mit Lena. Am Ende soll ein Video entstehen: links die Hotelsoftware, rechts die Anruf-Oberfläche, beide Stimmen auf einer Tonspur. Prüf danach automatisch, ob die Begrüßung vollständig ist, ob genau einmal gebucht wurde, ob die Reservierungsnummer ganz angesagt wurde und ob es nach einem Ergebnis lange Stille gibt. Lass ihn zweimal laufen und zeig mir die Auffälligkeiten.
```

**Unser Ergebnis:** Ein Lauf dauert 4 bis 7 Minuten und kostet rund 0,30 bis 0,50 Dollar. Heraus kommt ein Video
mit Hotelsoftware, Anruf-Oberfläche und beiden Stimmen.

**Warum so:** Ein einzelner Testanruf zeigt nur, ob es einmal klappt. Erst die wiederholten Läufe haben bei uns drei
Fehler gefunden. Lena sagte „587,20 Euro“ statt 568,20, deshalb gibt der Code Zahlen, Daten und Uhrzeiten in Worten
weiter. Sie kündigte „ich schaue im System nach“ an, ohne zu delegieren, deshalb stößt ein Wächter im Code nach
6 Sekunden nach. Und nach einer fertigen Buchung delegierte sie noch einmal, deshalb bekommt sie nach jedem Ergebnis
den Status „erledigt“ zu genau diesem Auftrag. Das Video ist außerdem dein Ersatz, falls bei einer Vorführung
Mikrofon oder WLAN streiken.

---

## Teil B: Arztpraxis, Sophie bucht über die nachgebaute Schnittstelle

Die Praxissoftware hat keine öffentliche Schnittstelle. Die Web-App spricht aber im Hintergrund mit ihrem Server.
Diese Anfragen schneidest du im Browser mit, Claude baut daraus eine eigene Schnittstelle.

> **Theoretische technische Option, keine Empfehlung.** Teil B zeigt, was technisch geht. Ob du eine Software so
> anbinden darfst, regeln die AGB des Herstellers. Für den Einsatz in einer echten Praxis brauchst du seine Erlaubnis
> oder eine Partnerschaft. Siehe auch den [Haftungshinweis](../README.md#haftungshinweis).

> [!WARNING]
> **Bevor du Reverse Engineering machst**
>
> - Nur mit deinem **eigenen Testkonto** und nur mit **erfundenen Patienten**. Nie mit Konten oder Daten einer echten
>   Praxis.
> - **HAR-Dateien** (Mitschnitt aller Netzwerkanfragen) nie teilen und nie committen. Trag `*.har` in die
>   `.gitignore` ein und lösch das Original, sobald die bereinigte Kopie fertig ist.

### Prompt 6 (Zusatz): Passende Praxissoftware finden

```text
Recherchier, ohne dich irgendwo anzumelden: Gesucht ist eine Praxissoftware aus den USA, die keine öffentliche, frei nutzbare Schnittstelle hat, komplett im Browser läuft und eine kostenlose Testversion ohne Verkaufsgespräch und möglichst ohne Kreditkarte anbietet. Sie muss sich aus Deutschland ohne US-Adresse registrieren lassen. Prüf die AGB: Gilt sie nur für die USA, und verbietet sie Reverse Engineering, Scraping oder Bots? Zitier die Stellen. Gib mir eine Tabelle mit Belegen, deine Empfehlung und einen Ersatz.
```

**Unser Ergebnis:** Mehrere bekannte Anbieter fielen raus, weil sie Bots und Reverse Engineering in den AGB
ausdrücklich verbieten. Übrig blieb eine Software mit kostenloser Testphase, ohne öffentliche Schnittstelle und zum
Zeitpunkt unserer Recherche ohne Verbot in den AGB. AGB ändern sich, prüf sie selbst, bevor du loslegst.

**Warum so:** Viele Praxisprogramme verbieten in den AGB genau das, was wir zeigen. Wer eine Software für einen
Kunden anbindet, braucht für den echten Einsatz ohnehin die Erlaubnis des Herstellers oder eine Partnerschaft. Für
den Nachbau reicht eine Software, deren AGB es nicht verbieten, und ausschließlich erfundene Patienten, denn echte
Gesundheitsdaten fallen unter DSGVO und in den USA unter HIPAA.

### Von Hand: Anfragen der Praxissoftware mitschneiden

Diesen Teil klickst du selbst, denn genau hier verstehst du, was Reverse Engineering ist. Melde dich in Chrome bei
der Praxissoftware an und tipp das Passwort selbst ein.

1. **Entwicklerwerkzeuge öffnen:** Im Tab der Praxissoftware Cmd+Option+I drücken (Windows: F12), den Reiter
   „Network“ wählen, den Filter auf „Fetch/XHR“ stellen und den Haken bei „Preserve log“ setzen. So bleiben nur die
   Datenanfragen übrig, und beim Neuladen verschwindet nichts.
2. **Genau das tun, was der Agent später können soll:** Einen Patienten suchen, den Kalender einer Woche öffnen, für
   eine Fake-Patientin einen Termin anlegen und ihn danach verschieben. Jede Aktion erzeugt neue Zeilen, beim Anlegen
   zum Beispiel eine `POST`-Anfrage.
3. **Eine Anfrage lesen:** Die Zeile mit der `POST`-Anfrage anklicken. „Headers“ zeigt Methode, Adresse und das
   Login-Cookie, „Payload“ zeigt, was die App geschickt hat, „Response“ die Antwort des Servers. Mit Rechtsklick und
   „Copy as cURL“ lässt sich die Anfrage als Befehl kopieren.
4. **Alles als HAR speichern:** Oben in der Network-Leiste auf den Pfeil nach unten klicken (Export HAR) oder
   Rechtsklick auf eine Zeile in der Liste, „Save all as HAR (sanitized)“. Als `praxis.har` in den Projektordner
   speichern.

**Warum so:** Chrome speichert die HAR-Datei standardmäßig bereinigt, ohne Cookies und Anmelde-Header. Für die
Analyse reicht das, Claude braucht nur Adressen, Parameter und Antworten. In den Antworten und im CSRF-Token
(Schutzwert gegen gefälschte Anfragen) stecken trotzdem Daten, die nicht öffentlich sein sollen. Deshalb prüft Claude
die Datei im nächsten Schritt als Erstes.

### Prompt 7: HAR bereinigen und Schnittstelle dokumentieren

```text
In praxis.har liegt ein Mitschnitt unserer Praxissoftware. Schreib zuerst ein kleines Skript, das daraus alle Cookies, Authorization- und CSRF-Werte entfernt, und arbeite danach nur noch mit der bereinigten Kopie. Sag mir, wenn ich das Original löschen kann.
Dann analysiere die Kopie: Finde alle Anfragen rund um Patienten und Termine und dokumentiere Endpunkte, Parameter, Antworten, Anmeldung und Zeitformat als Tabelle in docs/praxis-api.md. Markier, was du nur vermutest. Zeig mir zuerst die Doku, Code kommt erst im nächsten Schritt.
```

**Unser Ergebnis:** Die Praxissoftware nutzt eine klassische REST-Schnittstelle mit JSON, getrennt für Termine und
Patienten. Angemeldet wird so wie im Browser.

**Warum so:** Erst die Doku, dann der Code. Ein Missverständnis in einer Tabelle zu korrigieren kostet eine Minute,
im fertigen Client eine Stunde. Die Markierung für Vermutungen zeigt, was Claude nur geraten hat, zum Beispiel wie
ein Termin gelöscht wird. Das haben wir bewusst nie ausprobiert.

### Prompt 7a (Zusatz): Claude erkundet die App selbst

Der zweite Weg: Statt selbst mitzuschneiden, klickt Claude über die Chrome-Erweiterung „Claude in Chrome“ durch die
App und liest die Anfragen mit.

```text
Öffne die Praxissoftware in meinem Chrome, leg für eine Fake-Patientin einen Termin an und verschieb ihn danach. Lies dabei alle Netzwerkanfragen mit und ergänze docs/praxis-api.md. Speichere keine Cookies und Tokens, lösch nichts, und halt an, sobald ein Captcha oder eine Zwei-Faktor-Abfrage kommt.
```

**Unser Ergebnis:** So ist unsere Doku entstanden, ausschließlich im Testkonto und mit erfundenen Patienten.

**Warum so:** Gut zum Erkunden, weil Claude sieht, welche Anfrage zu welchem Klick gehört. Den fertigen Client baust
du trotzdem in Claude Code, weil er dort getestet und versioniert wird.

### Prompt 8: Client bauen und gegen das Testkonto testen

```text
Bau aus docs/praxis-api.md einen Python-Client für die Praxissoftware mit patient_suchen, freie_termine, termine_des_patienten, termin_buchen und termin_verschieben. Beachte:
- Anmeldung wie der Browser mit PRAXIS_EMAIL und PRAXIS_PASSWORD aus der .env. Die Sitzung holt der Client selbst und erneuert sie, wenn sie abläuft.
- Alle Zeiten in der Zeitzone, die in der Praxissoftware eingestellt ist.
- Freie Termine gibt es nicht als Abfrage. Rechne sie aus den Sprechzeiten Montag bis Freitag 9 bis 17 Uhr, 50 Minuten pro Termin, minus den belegten Terminen.
- Vor dem Buchen prüfen, ob die Zeit noch frei ist. Lesende Anfragen bei einem Verbindungsabbruch wiederholen, schreibende nie.
- Dazu ein Befehlszeilen-Werkzeug, das bei jedem Befehl die HTTP-Aufrufe zeigt.
Teste jede Funktion gegen das Testkonto, nur mit Fake-Patienten, lösch nichts, und zeig mir danach den gebuchten Termin im Kalender.
```

**Unser Ergebnis:** Ein Client mit den fünf Funktionen plus ein Befehlszeilen-Werkzeug. Jeder Aufruf dauert 0,2 bis
1 Sekunde, und der gebuchte Termin steht sofort im Kalender der Praxissoftware.

**Warum so:** Was die App stillschweigend richtig macht, muss der Client nachmachen. Ohne den Header
`Accept: application/json` kam bei uns eine HTML-Seite statt Daten zurück. Der Kalender zeigte Termine in der
Zeitzone des Browsers, deshalb rechnet der Client fest in der Zeit der Praxis. Jeder Patient hat zwei
verschiedene IDs. Und nach rund 75 Sekunden ohne Anfrage trennt der Server die Verbindung. Lesende Anfragen dürfen
dann wiederholt werden, eine wiederholte Buchung wäre ein doppelter Termin.

**So testest du es:** Lass dir die Patientenliste und die freien Zeiten eines Tages zeigen und buch per Befehl einen
Termin. Im Terminal siehst du jeden HTTP-Aufruf, und der Termin steht sofort im Kalender der Praxissoftware.

### Prompt 9: Sophie, die Telefon-Anmeldung

```text
Bau Sophie, die telefonische Anmeldung der Praxis Dr. Becker, als eigenständigen Voice Agent in diesem Projekt. Es gibt hier noch keinen anderen Agenten, alles entsteht neu. Beachte:
- Stimme: gpt-live-1 über WebRTC direkt aus dem Browser, Stimme „marin“, Deutsch. Unser Server hängt sich per Sideband-WebSocket an dieselbe Sitzung. Als Vorlage dienen die Live-Beispiele in openai-agents-python (examples/live), nicht RealtimeAgent.
- gpt-live-1 delegiert alles, was im Kalender steht, an gpt-6-luna. Dieses Backend bekommt die fünf Funktionen des Clients als Werkzeuge, unser Server führt sie aus und gibt das Ergebnis zurück.
- gpt-live-1 begrüßt nicht von selbst. Der Server löst beim Abheben die Begrüßung aus: „Praxis Dr. Becker, guten Tag, hier ist Sophie. Wie kann ich Ihnen helfen?“
- Ablauf: Name erfragen und die Patientin suchen, Wunschtag erfragen, höchstens drei freie Zeiten aus dem System nennen, vor dem Buchen zusammenfassen und fragen „Soll ich den Termin so eintragen?“. Erst nach einem klaren Ja buchen, pro Anruf höchstens ein neuer Termin.
- Sophie nennt nie freie Termine, bevor das System sie geliefert hat. Medizinische Fragen beantwortet sie nicht, bei Notfällen verweist sie sofort auf die 112.
- Links der Kalender der Praxissoftware, angemeldet über die Sitzung des Clients ohne Passwort im Browser, frei vergrößerbar und immer auf der Woche des besprochenen Tages. Nach einer Buchung lädt er neu und markiert den Termin. Rechts die Anruf-Oberfläche mit Live-Mitschrift, jedem HTTP-Aufruf samt Dauer, den Kosten und einem kleinen Symbol zum Zurücksetzen.
- Teste vorher selbst mit einem künstlichen Anrufer per Sprachausgabe, ohne Mikrofon, und beende danach alle Server und Fenster.
Starte alles mit einem Befehl, ich rufe dann selbst an.
```

**Unser Ergebnis:** Sophie hat live mit Mikrofon Termine gebucht und verschoben. Die Antworten der Praxissoftware
kamen jeweils in unter einer Sekunde.

**Warum so:** Ein Aufruf über die Schnittstelle dauert 0,2 bis 1 Sekunde, Lena braucht für dasselbe 35 Sekunden
Klicken. Sophie antwortet fast sofort. Das ist die Pointe: Reverse Engineering macht den Agenten schnell. Die Regel zu
freien Terminen steht im Prompt, weil Sophie in einem Test „es sind noch Termine frei“ sagte, bevor sie nachgesehen
hatte. Jede Buchung legt einen echten Termin im Testkonto an, deshalb für weitere Läufe einen anderen Tag nehmen.

---

## Prompt 10 (Zusatz): Eigene Praxissoftware programmieren

Der dritte Weg: Statt eine fremde Software anzubinden, baust du sie selbst. Dann gibt es die Schnittstelle von Anfang
an.

```text
Bau eine vollständig durchklickbare Demo-Praxissoftware als eine einzige HTML-Datei, ohne Build und ohne Netzwerkanfragen. Komplett Deutsch, eine fiktive Hausarztpraxis mit zwei Ärztinnen, Fake-Patienten und Terminen rund um das heutige Datum, gespeichert im Browser mit einem Knopf zum Zurücksetzen. Module: Kalender, Patienten, Termin anlegen, verschieben und absagen, Warteliste.
Bau von Anfang an eine Schnittstelle für Agenten mit ein, zum Beispiel freie_termine und termin_buchen. Halte die Regeln für Computer Use ein: keine nativen Auswahllisten und Datums-Popups, nichts nur per Hover, keine Ein-Tasten-Kürzel, das Layout springt nicht, Erfolg steht deutlich im Bild.
Klick danach jeden Button einmal durch und prüf, dass die Konsole fehlerfrei bleibt.
```

**Unser Ergebnis:** Für die Praxis haben wir das nicht gebaut. Unsere Hotelsoftware in [`hotel-demo/`](hotel-demo/)
ist aber genau nach diesem Muster entstanden, inklusive der Schnittstelle `window.hotelApi`.

**Warum so:** Kein Reverse Engineering, keine AGB-Frage, und die Software passt genau zu den Abläufen der Praxis. Mit
einigen Kunden haben wir so eigene Praxis-, ERP- und Personalsysteme gebaut. Wichtig ist der Durchklick-Test am Ende,
denn ein Button ohne Funktion fällt sonst erst dem Agenten auf.

## Prompt 11: Flowcharts

```text
Zeichne für beide Agenten den Ablauf eines Anrufs als einfaches Flowchart im Excalidraw-Stil: dunkler Hintergrund, Handschrift, Kästen von links nach rechts, über jedem Kasten das Icon des Dienstes, darunter ein kurzer Satz in Alltagssprache. Lena: Anrufer, Stimme, Backend, Computer Use, Hotelsoftware. Sophie: Anrufer, Stimme, Backend, nachgebaute Schnittstelle, Praxissoftware. Für Zuschauer ohne Technikwissen. Speichere es zusätzlich als .excalidraw-Datei, damit ich es nachbearbeiten kann.
```

**Unser Ergebnis:** Unser Use-Case-Board mit Architekturskizze liegt unter [`assets/uebersicht.excalidraw`](assets/uebersicht.excalidraw)
und als Bild unter [`assets/uebersicht.jpg`](assets/uebersicht.jpg).

## Prompt 12: Abschluss-Check

```text
Prüf das ganze Projekt gegen die Regeln aus der CLAUDE.md, auf Antwortzeiten und auf Sicherheit, besonders den Umgang mit Cookies, Passwörtern und der HAR-Datei. Nenn mir die drei wichtigsten Verbesserungen und setz sie erst nach meinem OK um.
```

---

## So zeigst du es

Erst rufst du im Hotel an, und Lena bucht ein Zimmer, während sich links die Software von selbst bedient. Dann rufst
du in der Praxis an und bittest um einen Termin zur Besprechung deiner Blutwerte am nächsten Nachmittag. Sophie nennt
freie Zeiten, bucht nach deinem Ja, und links springt der Kalender der Praxissoftware auf den neuen Termin. Der
Unterschied in der Wartezeit zeigt, warum die nachgebaute Schnittstelle besser ist als Klicken.

## So testest du es: Demo-Abläufe

Alle Namen, Nummern und Adressen sind erfunden. Die Preise stammen aus unserem Durchlauf. Die Hotelsoftware erzeugt
ihre Daten relativ zum heutigen Datum, Preise hängen außerdem von der Saison ab. Bei dir können Zahlen und
Reservierungsnummern also abweichen. Wähl Anreisetage, die ein paar Tage in der Zukunft liegen.

### Hotel: Fragen an Lena

Ein Anruf, sechs sichtbare Aktionen in der Software. Nach jeder Frage bedient der Agent links die Hotelsoftware.
Setz vorher die Demo-Daten zurück.

1. **Verfügbarkeit:** „Guten Tag, hier ist Jonas Petersen. Haben Sie vom 23. bis 26. Oktober ein Doppelzimmer für
   zwei Personen frei? Was kostet das?“ Die Software prüft die Verfügbarkeit. Bei uns: Doppelzimmer Standard
   385,20 €, Superior 460,20 € (Rate Standard).
2. **Zweiter Preisvergleich:** „Und was kostet die Suite mit Frühstück?“ Neue Prüfung. Bei uns: Suite, Mit
   Frühstück, 928,20 €.
3. **Buchen:** „Das ist mir zu viel. Dann nehme ich das Superior mit Frühstück.“ Bei uns: 568,20 €. Telefon in
   Gruppen nennen: „plus 49, 30, 23125, 123“. E-Mail: „jonas punkt petersen at example punkt com“. Beim Zurücklesen
   bestätigen. Bei der Zusammenfassung: „Ja, bitte verbindlich buchen.“ Die Software legt Reservierung und Gast an,
   Lena nennt die Reservierungsnummer.
4. **Sonderwunsch nachreichen:** „Ach, noch was: Wir kommen erst gegen 20 Uhr an, und bitte ein ruhiges Zimmer.“ Die
   Software öffnet die Reservierung, trägt eine Notiz ein und speichert.
5. **Parkplatz dazubuchen:** „Haben Sie auch einen Parkplatz?“ Auf „Soll ich das dazubuchen?“: „Ja, bitte.“ Die
   Software öffnet „Umbuchen / Bearbeiten“ und setzt das Häkchen „Parkplatz Tiefgarage“. Bei uns: 12 € pro Nacht,
   neuer Gesamtpreis 604,20 €.
6. **Alte Reservierung stornieren:** Such dir vorher in der Software eine bestehende Reservierung heraus und merk dir
   den Nachnamen und das Anreisedatum. Dann: „Und für meinen Kollegen gibt es noch eine Reservierung auf den Namen …
   am …, die soll ich stornieren.“ Auf die Rückfrage: „Ja, bitte stornieren.“ Die Software sucht den Namen, öffnet
   die Reservierung, storniert mit Grund.

Gut zu wissen:

- Jede Aktion dauert 10 bis 30 Sekunden, der ganze Anruf etwa 7 bis 9 Minuten. In der Zeit macht Lena
  Zwischenansagen.
- Pro Anruf nur eine neue Buchung, das ist der Schutz gegen Doppelbuchungen.
- Ohne Kopfhörer: Lautsprecher mittellaut, Mikrofon nah. Unterbricht Lena sich selbst, leiser stellen.
- Falls Mikrofon oder WLAN streiken: Der simulierte Anruf aus Prompt 5 erzeugt ein fertiges Video.

### Arzt: Fragen an Sophie

Kein Computer Use: Sophie arbeitet über die nachgebaute Schnittstelle. Jede Antwort der Praxissoftware kommt in unter
einer Sekunde, im Telefonfenster siehst du jeden HTTP-Aufruf (zum Beispiel `GET … → 200 · 280 ms`). Nimm für
die Anrufe Fake-Patientinnen aus deinem Testkonto. Unsere hießen zum Beispiel Miriam Krüger und Lena Hoffmann.

**Anruf 1: Neuer Termin**

- „Guten Tag, hier ist Miriam Krüger. Ich hätte gern einen Termin am Donnerstag vormittags.“
- Die Software sucht die Patientin und die freien Termine, der Kalender springt auf diese Woche. Sophie nennt drei
  Zeiten, zum Beispiel 9:00, 9:30 und 10:00 Uhr.
- „10 Uhr passt.“ Bei der Zusammenfassung: „Ja, bitte eintragen.“
- Der Termin wird angelegt, der Kalender lädt neu und markiert ihn.

**Anruf 2: Termin nachsehen und verschieben**

- Erst über das Symbol zum Zurücksetzen das Gespräch leeren, dann neuer Anruf.
- „Hallo, Lena Hoffmann hier. Wann ist denn mein nächster Termin?“ Sophie nennt den Termin aus dem Kalender.
- „Können wir den auf Freitag nachmittags verschieben?“ Sophie nennt Zeiten ab 13 Uhr.
- „14 Uhr bitte.“ Bei der Rückfrage: „Ja.“ Der Termin wird verschoben, der Kalender markiert den neuen Termin.

Gut zu wissen:

- Buchen und Verschieben legen echte Termine im Testkonto an. Löschen ist nicht erlaubt. Für jeden weiteren
  Durchlauf einen anderen Tag wählen, sonst sind die Zeiten belegt.
- Neue Patienten kann Sophie nicht anlegen, sie arbeitet nur mit vorhandenen.
- Uhrzeiten sind Ortszeit der fiktiven Praxis in Chicago.

## Optional: Echte Telefonnummer

In der Anleitung laufen beide Agenten über die Anruf-Oberfläche im Browser. gpt-live-1 kann Anrufe auch über SIP
(Standard für Internet-Telefonie) annehmen, zum Beispiel über eine Nummer bei Twilio.

```text
Verbinde Lena mit einer echten deutschen Telefonnummer über SIP, zum Beispiel bei Twilio. Deutsche Nummern brauchen ein Regulatory Bundle. Zeig mir Nummer und Preis, bevor du kaufst, und erklär mir, was ich im Browser bestätigen muss.
```

**Unser Ergebnis:** Nicht gebaut, im Video laufen beide Agenten im Browser.

## Regeln für Software, die ein Agent bedienen soll

Ein Computer-Use-Agent sieht nur Screenshots und hat nur Maus und Tastatur. Was einen Menschen nicht stört, bremst
ihn. Diese Regeln stecken schon in der Hotelsoftware. Gib sie Claude mit, wenn du eigene Software baust oder
anpasst:

- **Keine nativen Popups:** keine Auswahllisten (`<select>`), keine Datums-Popups des Browsers, kein `alert`,
  `confirm` oder `prompt`. Aufgeklappte native Listen erscheinen nicht im Screenshot. Stattdessen Textfelder wie
  TT.MM.JJJJ, Plus-Minus-Knöpfe und Dialoge in der Seite.
- **Nichts nur per Hover:** Jede Aktion ist ein sichtbarer, beschrifteter Button.
- **Keine Ein-Tasten-Kürzel:** Ein tippender Agent ohne Feldfokus würde sonst Seiten wechseln.
- **Strg+A markiert alles,** auch unter macOS, und ein Klick in ein gefülltes Feld markiert den Inhalt. Sonst tippt
  der Agent an den alten Wert an.
- **Das Layout springt nicht:** Zwischen Screenshot und Klick darf sich nichts verschieben. Feste Platzhalter, kein
  automatisches Scrollen, kurze Animationen.
- **Erfolg groß im Bild:** Ergebnis wie die Reservierungsnummer groß und eindeutig anzeigen, Fehler rot direkt am
  Feld.

Nach jeder Änderung mit einem echten Computer-Use-Lauf prüfen, nicht nur mit einem Test im Seitencode. Die
ausführliche Liste mit Umsetzung steht in [`hotel-demo/CODE-ERKLAERUNG.md`](hotel-demo/CODE-ERKLAERUNG.md#designregeln-für-computer-use-und-warum).
