# 00 Vorbereitung: Claude Code einrichten und richtig damit arbeiten

Diese Seite gilt für alle Use Cases. Du richtest sie einmal ein und kommst bei jeder Anleitung hierher zurück.
Danach weißt du, wie du Claude Code installierst, wo deine Keys hingehören und wie du Prompt für Prompt baust,
ohne dass dir das Projekt aus der Hand gleitet.

Die Anleitungen sind auf einem Mac geschrieben und getestet.

## Schritt 0: Claude Code und Homebrew installieren

Auf einem neuen Mac fehlt beides.

- **Claude Code** (der Coding Agent von Anthropic, der im Terminal für dich programmiert): Anleitung auf
  [claude.com/product/claude-code](https://claude.com/product/claude-code).
- **Homebrew** (Paketverwaltung für den Mac, damit lassen sich Werkzeuge mit einem Befehl installieren):
  [brew.sh/de](https://brew.sh/de/).

Homebrew installierst du selbst im Terminal, nicht über Claude. Der Installer fragt nach deinem Mac-Passwort, und das
kann Claude nicht für dich eingeben. Dabei kommen auch die Xcode Command Line Tools mit, die git braucht.

Öffne das Terminal (Cmd+Leertaste, „Terminal“ tippen) und führ nacheinander aus:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
curl -fsSL https://claude.ai/install.sh | bash
brew --version && claude --version
```

Am Ende zeigt der Homebrew-Installer unter „Next steps“ zwei Befehle. Führ sie aus und öffne das Terminal neu.
Wer Homebrew schon hat, prüft nur mit `brew --version`.

Zeigt die letzte Zeile zwei Versionsnummern, ist alles bereit.

## Schritt 1: Projektordner anlegen

Jeder Use Case bekommt einen eigenen, leeren Ordner.

1. Leg im Finder an einer beliebigen Stelle einen neuen, leeren Ordner an.
2. Tipp im Terminal `cd` und ein Leerzeichen.
3. Zieh den Ordner aus dem Finder ins Terminalfenster. Der Pfad erscheint von selbst. Drück Enter.
4. Starte Claude Code mit `claude`.
5. Claude fragt, ob es diesem Ordner vertrauen darf. Bestätige das.

Claude arbeitet ab jetzt in genau diesem Ordner.

## Schritt 2: Werkzeuge und Anmeldungen

Welche Werkzeuge du brauchst, steht in der Anleitung des jeweiligen Use Cases. Meist lässt du Claude sie installieren.
Zwei Dinge gelten dabei immer:

- **Nach jeder Installation `/exit` und `claude` neu starten.** Erst dann findet Claude die frisch installierten
  Befehle und neu eingerichtete Verbindungen.
- **Anmeldungen bei Diensten über `/mcp`.** Ein MCP (Model Context Protocol, eine Steckverbindung, über die Claude
  fremde Dienste bedienen kann) braucht oft eine Anmeldung im Browser. Tipp `/mcp` ein und wähl bei jeder Verbindung,
  die eine Anmeldung braucht, „Authenticate“.

Captchas, Bestätigungslinks und Passwörter im Browser übernimmst immer du selbst.

## Schritt 3: Keys gehören in die `.env`

Ein API-Key (ein Schlüssel, mit dem ein Programm auf einen Dienst zugreift und der auf deine Rechnung läuft) kommt
nie in den Chat. So gehst du vor:

1. Lass Claude im Projektordner eine `.env` anlegen und sie in die `.gitignore` eintragen. In der `.env` stehen alle
   nötigen Variablen mit leerem Wert, zum Beispiel `OPENAI_API_KEY=`.
2. Lass Claude die Datei mit `open -e .env` öffnen und dir sagen, wo du jeden Key im Dashboard des Anbieters findest.
3. Trag die Keys selbst ein und speichere.
4. Claude nutzt die Keys danach nur über die Variablen aus der `.env` und gibt nie einen im Chat aus.

**Was die `.env` schützt und was nicht:** Sie sorgt dafür, dass deine Keys nicht im Chatverlauf und nicht im Git
landen. Vor Claude schützt sie die Keys nicht, denn Claude hat Zugriff auf den ganzen Ordner. Arbeite deshalb nur in
Ordnern, in denen nichts liegt, was Claude nicht sehen soll.

Nimmst du deinen Bildschirm auf oder streamst du, sind die Keys beim Einfügen kurz im Bild. Verpixel sie im Schnitt
oder leg nach der Aufnahme neue Keys an.

## Schritt 4: So arbeitest du mit den Prompts

- **Prompt 1 im Plan-Modus.** Drück in Claude Code Shift+Tab, bis unten der Plan-Modus angezeigt wird. Claude plant
  dann nur und ändert noch nichts. Du liest den Plan, korrigierst ihn und gibst ihn frei.
- **Danach Prompt für Prompt.** Schick immer genau einen Prompt und geh erst weiter, wenn das Ergebnis passt.
  Passt etwas nicht, sag Claude konkret, was falsch ist, statt den nächsten Prompt hinterherzuschieben.
- **Prompts 1:1 kopieren.** Jeder Prompt steht in der Anleitung in einem eigenen Textblock, alle auf einer Seite.
- **Erst prüfen lassen, dann bauen.** Modellnamen, Preise und Befehle ändern sich gerade im Monatstakt. Die Anleitungen
  haben den Stand Oktober 2026. Lass Claude im ersten Prompt in der aktuellen Doku prüfen, ob alles noch stimmt.

## Das Grundmuster jeder Anleitung

Alle Anleitungen in diesem Repo folgen demselben Ablauf. Wenn du ihn einmal verstanden hast, kannst du damit auch
eigene Voice Agents bauen.

### 1. Prompt 1: Plan und Regeln

Der erste Prompt beschreibt, was gebaut wird, mit welchem Stack, und welche Regeln immer gelten. Daraus schreibt
Claude zwei Dateien:

- **`CLAUDE.md`**: die Regeln für das Projekt. Claude liest sie bei jedem Start von selbst. Du musst die Regeln also
  nicht in jeden Prompt schreiben. Typische Regeln: „Preise, Datum und Öffnungszeiten erfindet nie das Modell.“,
  „Keys nur in der `.env`.“, „Jede Prompt-Änderung nur mit Tests, eine Änderung pro Runde.“
- **`docs/architektur.md`**: wie das System aufgebaut ist. Claude ergänzt die Datei bei jedem Schritt. So weißt du
  auch in drei Wochen noch, warum etwas so gebaut ist.

Gebaut wird in Prompt 1 noch nichts. Erst wenn Plan und Regeln stimmen, geht es weiter.

Eine Vorlage für deinen eigenen Prompt 1:

```text
Wir bauen <WAS DU BAUST, IN ZWEI SÄTZEN>.
Stack: <DIENSTE UND MODELLE>. Recherchier zuerst in der aktuellen Doku, ob Modellnamen und Befehle noch so stimmen, und belege es mit Links.
Regeln für die CLAUDE.md:
- Keys nur in der .env, nie im Chat, nie im Git.
- Nur Testdaten und eigene Testnummern.
- Alles, was sich berechnen lässt (Datum, Preise, Öffnungszeiten, Einstufungen), entscheidet der Code, nie das Modell.
- Jede Prompt-Änderung nur mit Tests, eine Änderung pro Runde.
Halte Architektur und Regeln in docs/architektur.md fest und ergänze die Datei bei jedem Schritt. Mach dann einen Plan in Schritten. Nach meinem OK schreibst du nur die CLAUDE.md und docs/architektur.md, gebaut wird noch nichts.
```

### 2. Eine Änderung pro Runde

Jeder weitere Prompt baut genau einen Teil. Jeder Teil wird erst allein getestet, bevor er mit dem nächsten verbunden
wird. Geht etwas schief, weißt du so sofort, woran es liegt.

### 3. Tests statt Bauchgefühl

Ein Sprachmodell antwortet nicht jedes Mal gleich. In unseren Tests lief dieselbe Konfiguration mittags 120 von 120 Mal
richtig und abends nur 101 von 120 Mal. Deshalb gilt in allen Anleitungen: mehrere Läufe und eine Quote statt eines
einzelnen Testanrufs. Mehr dazu in [`ressourcen/evaluation.md`](../ressourcen/evaluation.md).

### 4. Abschluss-Check

Am Ende jeder Anleitung prüft Claude das ganze Projekt gegen die eigenen Regeln. Die Verbesserungen setzt Claude erst
nach deinem OK um.

```text
Prüf das ganze Projekt gegen die Regeln aus der CLAUDE.md, auf Antwortzeiten und auf Sicherheit. Nenn mir die drei wichtigsten Verbesserungen und setz sie erst nach meinem OK um.
```

## Weiter geht's

Such dir einen Use Case aus und öffne dessen Anleitung:

- [01 JARVIS](../01-jarvis/)
- [02 Inbound KI-Rezeptionist](../02-inbound-rezeptionist/)
- [03 Arzt und Hotel](../03-arzt-hotel/)
- [04 Outbound Cold Calling](../04-outbound-cold-calling/)
- [05 Trainingsplattform](../05-trainingsplattform/)
