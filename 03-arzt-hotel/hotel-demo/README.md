# Seeblick PMS: Demo-Hotelsoftware

Fiktive Hotelsoftware (Property-Management-System) des **Hotel Seeblick Rendsburg**
(4 Sterne, 40 Zimmer) für den **Voice Agents MEGA-Kurs 2027** von Everlast AI. Use Case: Ein
KI-Telefonagent nimmt Anrufe an und bucht in einer Software, die (scheinbar)
keine Schnittstelle hat, per **Computer Use** (Screenshots + Maus/Tastatur).
Zusätzlich gibt es eine interne JS-Schnittstelle `window.hotelApi`, etwa für eigene Tests. Der Computer-Use-Agent aus dem Kurs nutzt sie bewusst nicht.

Alle Namen, Firmen, Adressen, Telefonnummern, Steuer- und Bankdaten sind erfunden.

Wie die Datei aufgebaut ist und wie man sie ändert: [`CODE-ERKLAERUNG.md`](CODE-ERKLAERUNG.md).

## Bedienung

- `index.html` per Doppelklick öffnen (läuft als `file://`, keine Netzwerkanfragen,
  kein Build, keine externen Fonts/Bilder).
- Ideal bei **1440 × 900** oder **1280 × 800** (für Screenshots des Agenten).
  Ab 1024 px gut nutzbar, mobil grundsätzlich bedienbar.
- Daten liegen im `localStorage` des Browsers (Schlüssel `seeblick-pms:data:v3`).
  **Vor jeder Aufnahme zurücksetzen:** Einstellungen → Demo-Daten →
  „Demo-Daten zurücksetzen“ (auch im Benutzermenü oben rechts). Die Demo-Daten
  werden relativ zum heutigen Datum erzeugt (±34 Tage), die Demo ist also an
  jedem Tag gefüllt.
- Hell/Dunkel: folgt dem System, Umschalter oben rechts.

### Typischer Telefon-Buchungsablauf (für den Agenten)

1. Oben **„Neue Reservierung“** (oder „Verfügbarkeit prüfen“).
2. Schritt 1: Anreise/Abreise als `TT.MM.JJJJ` tippen (oder „Kalender“-Button),
   Erwachsene/Kinder wählen → **„Verfügbarkeit prüfen“**. Tabelle zeigt je
   Kategorie freie Zimmer und Gesamtpreise je Rate → Preisfeld anklicken.
3. Schritt 2: „Neuer Gast“ (Name, Telefon, E-Mail) oder „Bestehenden Gast suchen“.
4. Schritt 3: Extras, Kanal (z. B. „Voice Agent“), Notiz/Sonderwünsche.
5. **„Buchung bestätigen“** → grüne Bestätigung mit großer Reservierungsnummer
   (z. B. `R-1651`) plus Toast.

Weitere Flows: Reservierung per Suche oben (Nummer, Name, Telefon) finden →
„Umbuchen / Bearbeiten“, „Stornieren“ (Dialog mit Grund), „Notiz speichern“ /
„Als Aufgabe weitergeben“. Check-in mit Zimmerzuweisung und Meldeschein,
Folio (Leistungen, Zahlungen), Check-out mit Rechnungsabschluss und Druckansicht.

### Regeln für Computer Use (umgesetzt)

- Jede Aktion ist ein sichtbarer, beschrifteter Button/Link (Text + Icon).
  Drag & Drop im Belegungsplan ist nur eine Zusatzfunktion.
- Keine nativen Datums-Popups: Textfeld `TT.MM.JJJJ` (akzeptiert auch `20.10.`,
  `20102026`, `2026-10-20`) plus eigener In-Page-Kalender.
- Keine `alert/confirm/prompt`. Dialoge sind In-Page-Modals, schließen **nicht**
  durch Klick daneben und haben klare „Abbrechen“/„Speichern“-Buttons.
- Fehlermeldungen rot direkt am Feld, Erfolg als Toast + Status im UI.
- Animationen ≤ 150 ms, Klickflächen ≥ 32 px, Schrift ≥ 13 px.
- Ein Klick in ein gefülltes Textfeld markiert den ganzen Inhalt; `Strg+A` und `⌘+A`
  markieren immer alles (auch unter macOS). Erneutes Tippen ersetzt also sauber.
- Personenzahl über −/+-Buttons oder direktes Tippen der Zahl (keine nativen Selects).
- Keine Layoutsprünge in der Buchungsmaske: Zimmerfeld hat einen Platzhalter,
  „Buchung bestätigen“ steht fest oben in der Zusammenfassung, Fehler lösen kein
  automatisches Scrollen aus. Toasts erscheinen unten rechts.
- `translate="no"`: Chrome blendet keine Übersetzungsleiste ein.

## Module

| Route | Inhalt |
|---|---|
| `#/dashboard` | Anreisen/Abreisen/Im Haus, Auslastung heute/7 Tage, ADR, RevPAR, Aufgaben, Zimmerstatus, Handlungsbedarf, Protokoll, alle Kacheln klickbar |
| `#/belegungsplan?start=JJJJ-MM-TT&tage=7\|14\|30&kat=DZS` | Zimmer × Tage, Balken nach Status, „+ frei“ → neue Buchung, Drag & Drop mit Konfliktprüfung |
| `#/reservierungen` (+ `?q=&status=&kanal=&kat=&von=&bis=&bezug=`) | Liste mit Suche, Filtern, Sortierung, Paging, CSV |
| `#/reservierungen/neu` (+ `?zimmer=&anreise=&abreise=&gast=&kat=`) | Buchungsmaske mit Verfügbarkeit, Preisberechnung, Überbuchungsschutz |
| `#/reservierungen/R-1042` · `/bearbeiten` | Detail, Umbuchen, Stornieren, Option bestätigen, No-Show, Notiz |
| `#/checkin` (`?tab=anreisen\|abreisen\|inhouse&datum=`) · `#/checkin/R-…` · `#/checkout/R-…` | Front Office, Meldeschein, Check-out mit Rechnungsabschluss |
| `#/gaeste` · `#/gaeste/G-1001` · `/neu` · `/bearbeiten` | CRM mit Historie, Präferenzen, Notizen, VIP |
| `#/zimmer` (`?tab=aufgaben`) · `#/zimmer/101` | Zimmerstatus (sauber, schmutzig, in Reinigung, kontrolliert, außer Betrieb), Housekeeping-Aufgaben |
| `#/rechnungen` · `#/rechnungen/R-…` · `/druck` | Offene Folios, Rechnungen, Positionen, Zahlungen, Druck/PDF |
| `#/preise` (`?plan=STD\|FLEX\|NR\|BB`, `?tab=saisons\|artikel`) | Raten je Kategorie × Saison, Saisonzeiten, Artikelpreise und MwSt. |
| `#/berichte?bericht=auslastung\|umsatz\|anreisen\|abreisen` | SVG-/CSS-Charts, Druck, CSV |
| `#/einstellungen?tab=…` | Hoteldaten, Benutzer (Wechsel oben rechts), Demo-Daten (Reset, JSON-Export/-Import), Protokoll |

Tastatur: `Strg/⌘+K` Suche, `Enter` in Schritt 1 prüft die Verfügbarkeit, `Esc`
schließt Menüs/Kalender. Bewusst **keine Ein-Tasten-Kürzel**: Ein tippender Agent
ohne Feldfokus würde sonst Seiten wechseln.

## Datenmodell (State in `localStorage`)

```text
hotel          Stammdaten (Name, Adresse, USt-IdNr., Bank, Check-in/out-Zeiten)
users[]        {id:'U1', name, role:'Rezeption'|'Housekeeping'|'Manager'}; currentUserId
rooms[]        {no:'101', category:'EZ', floor, hk:'sauber'|'schmutzig'|'reinigung'|'kontrolliert'|'ooo', note, oooReason, oooFrom, oooUntil}
guests[]       {id:'G-1001', salutation, title, firstName, lastName, company, email, phone, street, zip, city, country,
                nationality, birthDate, language, idType, idNo, vip, preferences[], notes, createdAt}
reservations[] {id:'R-1042', guestId, roomNo, category, arrival, departure (ISO), adults, children, ratePlan,
                nightly:[{date, price}]   ← Preis wird bei Buchung eingefroren
                extras:{breakfast, parking, pet}, cityTaxExempt, prices:{breakfast, parking, pet, cityTax},
                status:'option'|'bestaetigt'|'angereist'|'abgereist'|'storniert'|'noshow', optionUntil,
                channel:'Direkt'|'Telefon'|'Booking.com'|'Expedia'|'Walk-in'|'Voice Agent',
                notes, charges[] (Nebenleistungen), payments[], registration (Meldeschein),
                invoiceNo, invoiceDate, createdAt, createdBy, cancelledAt, cancelReason, checkedInAt, checkedOutAt}
tasks[]        {id:'T-101', type, title, roomNo, dept, assigneeId, due, priority, done, doneAt, note}
ratePlans[]    STD Standard · FLEX Flex · NR Nicht erstattbar · BB Mit Frühstück
seasons[], seasonByMonth[12]   NS/ZS/HS je Monat
rates          {'DZS|HS|STD': 139, …}  Preis pro Zimmer/Nacht inkl. 7 % MwSt.
articles[]     {code, name, price, vat, unit, group:'extra'|'pos', variable}
log[]          Aktivitätsprotokoll {ts, actor, text, ref}
```

Kategorien: EZ (6 Zimmer), DZS Doppelzimmer Standard (14), DZP Superior (9),
JS Junior Suite (4), SU Suite (2), FAM Familienzimmer (5). Zwei Zimmer sind
zeitweise außer Betrieb (208, 403).

Steuern: Übernachtung 7 %, Frühstück und Nebenleistungen 19 %, Kurtaxe nicht
steuerbar (0 %). Bei der Rate „Mit Frühstück“ wird der Arrangementpreis aufgeteilt
in „Logis … (Arrangement „Mit Frühstück“, ohne Frühstücksanteil)“ zu 7 % und
„Frühstücksanteil Arrangement“ zu 19 %; die Zusammenfassung zeigt den
Arrangementpreis pro Nacht. Hinweis: Seit 01.01.2026 gilt für Speisen
in der Gastronomie 7 %, die Demo setzt vereinfacht 19 % für alle
Nebenleistungen; pro Artikel unter Preise & Raten → Artikel änderbar.

## JS-API `window.hotelApi`

Gleiche Logik wie die Oberfläche (inkl. Überbuchungsschutz), die UI aktualisiert
sich danach. Alle Methoden liefern `{ok:true, …}` oder `{ok:false, code, error}`.
Datumsangaben: `"2026-10-20"`, `"20.10.2026"`, `"heute"`, `"morgen"`.
`hotelApi.help()` listet alles auf.

```js
hotelApi.checkAvailability({from:'20.10.2026', to:'23.10.2026', guests:2})
hotelApi.getRates({from:'20.10.2026', nights:3, category:'DZS', ratePlan:'BB', adults:2})
hotelApi.createReservation({firstName:'Karl', lastName:'Muster', phone:'+49 30 23125 …',
  from:'20.10.2026', to:'23.10.2026', category:'DZS', adults:2,
  ratePlan:'STD', extras:{breakfast:true}, notes:'Anreise spät'})   // channel default "Voice Agent"
hotelApi.findReservation('Muster')          // Nummer, Name, Telefon, E-Mail, Zimmer
hotelApi.updateReservation('R-1042', {to:'24.10.2026'})
hotelApi.addNote('R-1042', 'Zustellbett gewünscht')
hotelApi.cancelReservation('R-1042', 'Gast hat abgesagt')
hotelApi.listArrivals('heute') · listDepartures() · listInhouse()
hotelApi.checkIn(id, {roomNo}) · checkOut(id) · addCharge(id, {code:'MB2', qty:2}) · addPayment(id, {method:'Karte', amount:120})
hotelApi.findGuest(q) · createGuest({...}) · updateGuest(id, {...})
hotelApi.listRooms({status}) · setRoomStatus('101', 'sauber') · listTasks() · createTask({...})
hotelApi.getOccupancy('heute') · reset()
```

Fehlercodes u. a.: `NO_AVAILABILITY`, `ROOM_NOT_AVAILABLE`, `TOO_MANY_GUESTS`,
`ARRIVAL_IN_PAST`, `INVALID_ARRIVAL`, `GUEST_LASTNAME_REQUIRED`, `NOT_CANCELLABLE`,
`OPEN_BALANCE`, `ROOM_NOT_CLEAN`, `REGISTRATION_MISSING`.

## Automatisierung

Stabile `id`s/`data-testid`s, z. B. `btn-top-new-reservation`, `bf-arrival`,
`bf-departure`, `bf-adults`, `bf-check`, `pick-DZS-STD`, `bf-g-lastname`,
`bf-submit`, `new-res-number`, `btn-edit`, `btn-cancel`, `cancel-confirm`,
`res-note`, `btn-save-note`, `global-search`, `bar-R-1042`, `cell-101-2026-10-20`.

## Aufbau der Datei

Eine einzige `index.html`: CSS (Tokens für Hell/Dunkel, Print-CSS), SVG-Icon-Sprite,
App-Shell, ein Skript mit den Abschnitten Utils · Stammdaten · Seed (deterministisch,
relativ zu heute) · Store · Domain-Logik · UI-Infrastruktur (Router, Modals, Toasts,
Kalender) · Views · Aktionen · `window.hotelApi` · Start.

## Bekannte Einschränkungen

- Demo, keine echte Software: keine Mehrbenutzer-Synchronisation (nur pro Browser),
  keine Gruppenbuchungen, keine Stornogebühren-Berechnung, keine Kartenzahlung.
- Rund 650 Reservierungen auf 96 Gästeprofile: Stammgäste haben dadurch mehrere
  Aufenthalte in wenigen Wochen (im Szenario: Geschäftsreisende/Monteure).
- Ein Gast kann pro Buchung nur ein Zimmer belegen.
