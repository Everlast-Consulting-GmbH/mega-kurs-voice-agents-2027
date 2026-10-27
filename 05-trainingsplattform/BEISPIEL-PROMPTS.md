# Bauanleitung: Trainingsplattform mit KI-Kunden

Mit diesen Prompts baust du die Plattform lokal auf deinem Rechner nach. Wie alle Anleitungen im Repo gilt:
Prompt 1 im Plan-Modus, danach Prompt für Prompt, immer erst weiter, wenn das Ergebnis passt.

## Vorbereitung

1. Claude Code und Homebrew einrichten, Projektordner anlegen: [`00-vorbereitung/`](../00-vorbereitung/).
2. Leg den Ordner `personas/` aus diesem Repo in deinen Projektordner. Darin liegen drei fiktive KI-Kunden als Vorlage.
3. Kopfhörer bereitlegen. Ohne Kopfhörer hört der KI-Kunde sich selbst über die Lautsprecher, und seine Stimme zählt
   in der Aufnahme als Sprache des Mitarbeiters.

### Werkzeuge von Claude installieren lassen

```text
Installiere mir Node.js und ffmpeg. Prüf danach mit den Versionsbefehlen, ob alles läuft, und sag mir, was fehlt. Mach danach in diesem Ordner git init.
```

Danach Claude mit `/exit` beenden und neu starten, damit die frisch installierten Befehle gefunden werden.

### Konten einrichten lassen

```text
Leg im Projektordner eine .env an und trag sie in die .gitignore ein. Schreib diese Variablen mit leerem Wert hinein: OPENAI_API_KEY und JUDGE_API_KEY.
- Öffne die Datei mit open -e .env und sag mir, wo ich die Keys finde.
- Warte, bis ich gespeichert habe. Nutz die Keys danach nur über Variablen aus der .env und gib nie einen im Chat aus.
Prüf dann mit einer kleinen Anfrage, ob der OpenAI-Key funktioniert und ob gpt-live-1 für mein Konto freigeschaltet ist.
```

Die `.env` hält die Keys aus dem Chatverlauf und aus dem Git heraus. Vor Claude schützt sie sie nicht, denn Claude hat
Zugriff auf den ganzen Ordner.

Dann Prompt 1 im Plan-Modus schicken (Shift+Tab).

## Prompt 1: Plan und Regeln

```text
Wir bauen eine lokale Trainingsplattform für Vertriebler. Ein Mitarbeiter wählt einen KI-Kunden aus und telefoniert im Browser mit ihm. Nach dem Auflegen bekommt er eine Auswertung, bei der jede Bewertung ein wörtliches Zitat aus dem Gespräch hat.
Stack: Ein kleiner Node.js-Server ohne Framework, der die Seite ausliefert und den Key hält. Der KI-Kunde läuft mit OpenAI gpt-live-1, der Browser verbindet sich per WebRTC direkt mit OpenAI, der Server tauscht nur den Verbindungsaufbau aus. Bewertet wird nach dem Auflegen von einem zweiten Sprachmodell. Gespeichert wird als Dateien, ohne Datenbank. Recherchier zuerst in der aktuellen OpenAI-Doku, wie gpt-live-1 im Browser per WebRTC funktioniert, und belege es mit Links.
Regeln für die CLAUDE.md:
- Keys nur in der .env, nie im Chat, nie im Git, nie im Browser.
- Nur fiktive Personen und Firmen in den Personas.
- Jede Persona ist eine Datei in personas/. Der Prompt wird nie im Code fest verdrahtet.
- Ob bewertet wird, ob ein Zitat gilt und wie der Score entsteht, entscheidet der Code, nie das Modell.
- Aufnahmen und Transkripte bleiben lokal und kommen nie ins Git.
- Jeder Teil wird erst allein getestet, bevor er mit dem nächsten verbunden wird.
Halte Architektur und Regeln in docs/architektur.md fest und ergänze die Datei bei jedem Schritt. Mach dann einen Plan in Schritten. Nach meinem OK schreibst du nur die CLAUDE.md und docs/architektur.md, gebaut wird noch nichts.
```

**Warum so:** Die Regeln in der CLAUDE.md gelten in jedem Schritt, du musst sie nicht in jeden Prompt schreiben. Die
wichtigste Regel ist die vierte: Ein Sprachmodell darf bewerten, aber ob ein Gespräch überhaupt bewertet wird und ob
ein Beleg gilt, prüft der Code. Sonst kannst du keiner Auswertung trauen.

## Prompt 2: Persona bauen

```text
Lies die drei Personas in personas/ und bau daraus das Format für alle KI-Kunden. Beachte:
- Jede Persona hat Rolle, Persönlichkeit und Ton, verdecktes Wissen, Regeln mit No-Gos und einen Gesprächsverlauf.
- Leg pro Persona fest, was der Mitarbeiter vor dem Anruf sieht, so wie er es im CRM sehen würde: Name, Firma, woher der Kontakt kommt. Das zeigt die Seite vor dem Anruf an, den Rest kennt nur die Persona.
- Jede Persona beendet das Gespräch immer mit genau demselben Satz: „Ich muss los. Wiederhören.“ Sonst sagt sie diesen Satz nie.
- Kommentare in der Datei werden vor dem Senden entfernt. Jede Fassung bekommt einen Hash, der mit jedem Gespräch gespeichert wird.
Schreib einen Test, der für jede Persona prüft, dass alle Abschnitte da sind und der Abschiedssatz vorkommt.
```

**Warum so:** Die Persona braucht Briefing, Rolle und No-Gos, damit sie wie ein echter Lead reagiert und nicht
hilfsbereit mitverkauft. Das verdeckte Wissen gibt sie nur auf gute Fragen preis, genau das trainiert der Mitarbeiter.
Der feste Abschiedssatz ist die Stelle, an der der Code erkennt, dass die Persona auflegen will. Die Persona darf nur
nach einer Verabschiedung auflegen, und der Code prüft das. Mit dem Hash weißt du später, mit welcher Fassung ein
Gespräch geführt wurde.

## Prompt 3: Anruf im Browser

```text
Bau den Anruf im Browser. Beachte:
- Vor dem Anruf: Szenario wählen, die CRM-Infos der Persona sehen und per Häkchen in die Aufnahme einwilligen. Ohne Häkchen startet kein Anruf.
- Der Browser baut die WebRTC-Verbindung zu gpt-live-1 auf, der Server schickt nur den Verbindungsaufbau mit dem Key an OpenAI und gibt die Antwort zurück. Persona-Prompt und Key bleiben auf dem Server.
- Die Persona nimmt ab wie am Telefon, nur mit ihrem Nachnamen. Spricht sie nach einigen Sekunden nicht, stößt der Client sie einmal an.
- Ein Abschieds-Wächter legt auf, wenn der Abschiedssatz im Transkript der Persona steht, sie danach hörbar gesprochen hat und danach kurz Stille ist. Dazu ein Auflegen-Knopf und eine Höchstdauer von 10 Minuten.
- Das Mikrofon bleibt während des ganzen Gesprächs an.
Starte alles mit einem Befehl, gib mir die Adresse und sag mir, wann ich mit Kopfhörer anrufen kann.
```

**Warum so:** Der Browser spricht direkt mit OpenAI, deshalb gibt es keinen Umweg über deinen Server und kaum
Verzögerung. Den Key bekommt die Seite trotzdem nie zu sehen. Beim Testen haben wir drei Fallen gefunden: GPT-Live
bestätigte die Startanweisung manchmal, sagte aber nichts. Deshalb der Anstoß nach ein paar Sekunden Stille. Das
Transkript des Abschiedssatzes kam manchmal an, bevor er zu hören war. Ein Wächter, der nur auf den Text schaut, schneidet
den Abschied dann ab. Und ohne durchgehendes Mikrofon-Audio blieb das Gespräch stehen, die Persona nahm gar nicht ab.

## Prompt 4: Transkript und Aufnahme speichern

```text
Speichere jedes Gespräch in einem eigenen Ordner unter data/sessions/. Beachte:
- Nimm im Browser beide Seiten in Stereo auf: links der Mitarbeiter, rechts die Persona.
- Bau aus den Transkript-Teilen Beiträge mit fester ID, Sprecher und Zeitstempel. Leg jeden Beitrag an die gemessene Sprechphase desselben Sprechers in der Aufnahme an, nicht an die Ankunftszeit der Nachricht.
- Speichere dazu Dauer, Persona, Persona-Hash, Grund für das Ende und ob die Verbindung technisch abgebrochen ist.
- data/ steht in der .gitignore.
Zeig mir nach einem Testanruf das gespeicherte Transkript mit Zeitstempeln und spring in der Aufnahme an einen Beitrag, um zu prüfen, dass die Zeit stimmt.
```

**Warum so:** Eine Bewertung mit Zeitstempel ist nur etwas wert, wenn ein Klick genau an die richtige Stelle der
Aufnahme springt. Bei uns lief die Uhr des Transkripts gegenüber dem Audio um rund 10 Prozent auseinander. Deshalb
verankert der Code jeden Beitrag an der gemessenen Sprechphase in der Aufnahme. Die getrennten Spuren zeigen außerdem
sofort, wer wann gesprochen hat.

## Prompt 5: Bewerten mit Belegen

```text
Bau die Bewertung nach dem Auflegen. Beachte:
- Kriterien mit Gewicht: Skripttreue 30, Gap 25, Qualifizierung 20, Verbindlichkeit 10, Fragetechnik 10, Tonalität 5. Gap heißt: Der Mitarbeiter arbeitet die Lücke heraus, etwa mit einer Skala von 1 bis 10 und der Frage, was bis zur 10 fehlt.
- Harte Fehler, die das Gespräch sofort durchfallen lassen: „Preis genannt“, „Termin ohne Entscheider“ und „Aufgelegt ohne nächsten Schritt“.
- Das Judge-Modell bekommt das Transkript mit den Beitrags-IDs und gibt für jedes Kriterium eine Punktzahl, die Beitrags-ID und ein wörtliches Zitat zurück, als festes JSON.
- Belegprüfung im Code: Ein Zitat gilt nur, wenn es wörtlich in genau diesem Beitrag steht und der Sprecher stimmt. Ein Kriterium ohne gültigen Beleg wird nicht gezeigt, sondern als „nicht belegt“ markiert.
- Den Score rechnet der Code aus den Gewichten, nicht das Modell. Bestanden ist ein Gespräch ab 70 Punkten und ohne harten Fehler.
- Nimm als Judge ein Modell aus einer anderen Modellfamilie als die Persona.
Leg 10 Testtranskripte an, darunter je eines für jeden harten Fehler, und zeig mir die Bewertungen als Tabelle. Ich prüfe sie selbst und sage dir, wo der Judge falsch liegt.
```

**Warum so:** Jede Bewertung zeigt auf eine Stelle im Gespräch, die ein Mensch nachprüfen kann. Ohne wörtliches Zitat
ist ein Urteil nur Rauschen. Ein Zitat, das nur irgendwo im Transkript vorkommt, reicht nicht, es muss im richtigen
Beitrag beim richtigen Sprecher stehen. Den Score rechnet der Code, damit dieselbe Bewertung immer dieselbe Zahl ergibt.
Die harten Fehler sind die teuren Fehler im echten Vertrieb, deshalb gleicht sie kein gutes Kriterium aus. Die 70 Punkte
sind ein Startwert, leg deine eigene Schwelle fest.

## Prompt 6: Türsteher

```text
Bau vor die Bewertung einen Türsteher im Code, ohne KI. Ein Gespräch wird nur bewertet, wenn es mindestens 60 Sekunden gedauert hat und der Mitarbeiter mindestens drei eigene Beiträge mit je mindestens drei Wörtern hatte. Ist die Verbindung technisch abgebrochen, gibt es keine Bewertung, sondern den Hinweis „Verbindung abgebrochen, bitte neu starten“. Zeig dem Mitarbeiter in jedem Fall, warum es keine Bewertung gibt.
Schreib Tests für alle Grenzfälle: 59 und 60 Sekunden, zwei und drei Beiträge, Abbruch.
```

**Warum so:** Ein Judge bewertet auch ein Gespräch von zehn Sekunden und erfindet dann Stärken und Schwächen. Der
Türsteher entscheidet vorher, ob es überhaupt etwas zu bewerten gibt. Ein technischer Abbruch ist kein schlechtes
Gespräch, deshalb zählt er nicht als Lauf. So landet im Verlauf nur, was der Mitarbeiter wirklich selbst geführt hat.

## Prompt 7: Auswertung, Verlauf und „Melden“

```text
Bau die Auswertung und den Verlauf. Beachte:
- Die Auswertung zeigt Score, bestanden ja oder nein, die harten Fehler und jedes Kriterium mit Zitat. Ein Klick auf ein Kriterium springt in der Aufnahme an die Stelle und spielt sie ab.
- An jedem Kriterium gibt es einen Knopf „Melden“. Der Mitarbeiter schreibt kurz dazu, was falsch wirkt. Die Meldung wird mit Gespräch, Kriterium und Persona-Hash gespeichert und ändert die Bewertung nicht.
- Eine Seite „Verlauf“ zeigt jeden früheren Anruf des Mitarbeiters mit Datum, Dauer, Persona und Score und darunter die Entwicklung je Kriterium.
- Der Verlauf ist pro Mitarbeiter getrennt. Für den lokalen Bau reicht ein Namensfeld beim Start, schreib in docs/architektur.md, dass für echten Einsatz ein Login nötig ist.
- Eine Seite „Meldungen“ listet alle Meldungen, damit ich Judge und Personas verbessern kann.
Mach drei Testanrufe mit derselben Persona und zeig mir danach den Verlauf.
```

**Warum so:** Die Auswertung soll beim Lernen helfen, deshalb führt jeder Punkt direkt an die Stelle im Gespräch. Der
Knopf „Melden“ ist der wichtigste Knopf der Plattform: Er zeigt dir, wo der Judge danebenliegt, und gibt dem
Mitarbeiter das Gefühl, dass eine falsche Bewertung nicht einfach stehen bleibt. Aus den Meldungen werden neue
Testtranskripte für Prompt 5. Der Verlauf zeigt, ob jemand besser wird, und gehört nur dem Mitarbeiter selbst.

## Prompt 8: Abschluss-Check

```text
Prüf das ganze Projekt gegen die Regeln aus der CLAUDE.md, auf Antwortzeiten und auf Sicherheit, besonders ob der Key irgendwo im Browser landen kann und ob Aufnahmen oder Transkripte ins Git geraten können. Nenn mir die drei wichtigsten Verbesserungen und setz sie erst nach meinem OK um.
```

## So zeigst du es

Ruf mit Kopfhörer einen KI-Kunden an und nenn früh einen Preis. Die Auswertung zeigt den harten Fehler „Preis
genannt“, das Gespräch ist nicht bestanden. Ruf noch einmal an, stell gute Fragen und vereinbare einen Termin mit dem
Mitentscheider. Klick in der Auswertung auf ein Kriterium und spring an die Stelle in der Aufnahme. Zeig dann einen
Anruf unter 60 Sekunden, bei dem der Türsteher greift, und öffne zum Schluss den Verlauf.

## Optional: Nochmal ab dem Einwand

```text
Bau einen Knopf „Ab dem Einwand nochmal“. Er startet ein neues Gespräch mit derselben Persona, das genau beim Einwand einsteigt: Die Persona bekommt den bisherigen Verlauf bis einschließlich ihres Einwands und wiederholt ihn. Dieses Gespräch bekommt keine neue Note, es dient nur zum Üben dieser einen Stelle.
```

**Warum so:** Die meisten Gespräche kippen an einer Stelle. Statt jedes Mal von vorn anzufangen, übt der Mitarbeiter
genau diese Stelle so oft, bis sie sitzt.

## Optional: Eigene Personas

Kopier eine der Vorlagen aus [`personas/`](personas/) und ändere Rolle, verdecktes Wissen und No-Gos. Halte die
Struktur und den festen Abschiedssatz bei. Teste jede neue Persona mit mindestens drei Anrufen: einem guten, einem
schlechten und einem, in dem du sie aus der Rolle bringen willst.

| Vorlage | Branche | Einwand gleich am Anfang |
|---|---|---|
| [Uwe Brandt](personas/uwe-brandt.md) | Handwerk, Heizung und Sanitär | „Wenn das wieder so ein KI-Ding ist, hab ich schon.“ |
| [Martin Kessler](personas/martin-kessler.md) | Gesundheit, Training nach der Physiotherapie | „Das zahlt doch die Kasse nicht, oder?“ |
| [Sabine Hartmann](personas/sabine-hartmann.md) | B2B, Software für Logistik | „Ihr Angebot liegt dreißig Prozent über dem anderen.“ |
