# Glossar

Die wichtigsten Begriffe aus dem Kurs, kurz und alltagsnah erklärt.

**A/B-Test**
Zwei Versionen eines Agenten laufen nebeneinander, und du misst, welche besser abschneidet. Offline laufen beide gegen
dieselben Testfälle, live bekommt die neue Version zuerst nur einen kleinen Teil der Anrufe.

**Computer Use**
Ein KI-Modell bedient eine Software wie ein Mensch vor dem Bildschirm: Es sieht Screenshots und klickt und tippt mit
Maus und Tastatur. Nützlich für Software ohne Schnittstelle, aber langsamer als eine Schnittstelle.

**Embeddings**
Eine Übersetzung von Text in eine Zahlenreihe, die seine Bedeutung abbildet. Texte mit ähnlicher Bedeutung bekommen
ähnliche Zahlen. So findet eine Suche auch „Halter für dicke Platten“, wenn im Text „Wandhalter für Glasplatten bis 12 mm“ steht.

**HAR**
Eine Datei, in der der Browser alle Anfragen einer Website mitschneidet (HTTP Archive). Grundlage für Reverse
Engineering. Enthält oft Cookies, Tokens und persönliche Daten und gehört deshalb nie an die Öffentlichkeit.

**Halbduplex und Vollduplex**
Halbduplex funktioniert wie ein Funkgerät: Das Modell hört zu, bis du eine Pause machst, und antwortet erst dann.
Vollduplex funktioniert wie ein Mensch am Telefon: Das Modell hört weiter zu, während es selbst spricht, und kann
abbrechen, kurz warten oder nebenbei ein Werkzeug aufrufen. GPT-Live ist Vollduplex.

**Hybrid Search**
Eine Suche, die zwei Verfahren kombiniert: die Bedeutungssuche über Embeddings und die klassische Volltextsuche nach
exakten Wörtern. Die eine versteht, was gemeint ist, die andere findet exakte Artikelnummern wie „A-1042“.

**Judge**
Ein Sprachmodell, das prüft statt spricht. Es bewertet ein Gespräch nach festen Kriterien und belegt jede Bewertung
mit einem wörtlichen Zitat. Am besten aus einer anderen Modellfamilie als der Agent.

**LLM**
Large Language Model, ein großes Sprachmodell wie GPT, Claude oder Gemini. Im Voice Agent entscheidet es, was
geantwortet wird und welches Werkzeug aufgerufen wird.

**OCR**
Optical Character Recognition, Texterkennung. Macht aus einem gescannten Dokument oder PDF lesbaren Text. Gute OCR wie
Mistral OCR erhält dabei auch Tabellen.

**Persona**
Eine feste Rolle für ein Sprachmodell, mit Name, Persönlichkeit, Anliegen und Regeln. Als Testanrufer prüft eine
Persona deinen Agenten, auf der Trainingsplattform spielt sie den Kunden.

**Post-Call-Webhook**
Ein Aufruf an deinen Server nach dem Auflegen. Darüber kommen Transkript und Auswertung des Gesprächs, zum Beispiel um
ein Ticket anzulegen oder das Gedächtnis des Agenten zu füllen.

**Pre-Call-Webhook**
Ein Aufruf an deinen Server, während es noch klingelt. Dein Server liefert die Werte für genau dieses Gespräch, etwa
Datum, Öffnungsstatus oder den Namen des Anrufers. Kostet keine Gesprächszeit.

**RAG**
Retrieval Augmented Generation, Suche in einer Wissensbasis. Der Agent schlägt vor der Antwort in deinen eigenen
Dokumenten nach, statt sich auf sein Allgemeinwissen zu verlassen.

**Regulatory Bundle**
Ein Nachweispaket, das Telefonanbieter wie Twilio für deutsche Rufnummern verlangen, etwa Name, Adresse und
Unternehmensnachweis. Die Prüfung dauert einige Tage, deshalb früh beantragen.

**Reverse Engineering**
Herausfinden, wie eine Software intern funktioniert. Im Kurs heißt das: mitschneiden, welche Anfragen eine Web-App an
ihren Server schickt, und daraus eine eigene Schnittstelle bauen. Vorher die AGB prüfen.

**SIP-Trunk**
Die Leitung, über die ein Voice Agent ans normale Telefonnetz angeschlossen wird. SIP ist das Protokoll für
Internettelefonie, der Trunk die Verbindung zwischen deinem System und dem Telefonanbieter.

**Speech-to-Speech**
Ein Modell, das Sprache hört und direkt mit Sprache antwortet, ohne Umweg über Text. Beispiele sind GPT-Realtime und
GPT-Live. Klingt natürlicher und reagiert schneller als die Kette aus STT, LLM und TTS.

**STT**
Speech-to-Text, Spracherkennung. Macht aus dem, was der Anrufer sagt, Text.

**Thompson Sampling**
Ein Verfahren, das Anrufe automatisch auf mehrere Versionen verteilt. Die Version, die gerade besser abschneidet,
bekommt mehr Anrufe, die anderen werden aber weiter getestet. So lernst du schneller, ohne viele Anrufe an eine
schlechte Version zu verlieren.

**Tool-Call**
Ein Werkzeugaufruf. Der Agent ruft während des Gesprächs eine Funktion auf, zum Beispiel „freie Termine suchen“, und
bekommt ein Ergebnis zurück. Jeder Aufruf im Gespräch kostet Wartezeit.

**TTS**
Text-to-Speech, Sprachausgabe. Macht aus der Antwort des Sprachmodells gesprochene Sprache.

**VAD**
Voice Activity Detection. Erkennt, wann jemand spricht und wann Stille ist. Davon hängt ab, wann der Agent antwortet und
ob er sich unterbrechen lässt.
