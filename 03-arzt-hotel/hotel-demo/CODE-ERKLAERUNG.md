# Code-Erklärung: Seeblick PMS (Demo-Hotelsoftware)

Für alle, die die Demo ändern oder für eine andere Branche nachbauen wollen (z. B. mit Claude Code).
Bedienung, Routen-Übersicht, Datenmodell und API-Beispiele stehen in der [`README.md`](README.md); hier geht es
darum, **wie die Datei gebaut ist**. Zeilenangaben beziehen sich auf den Stand vom 15.10.2026 (3216 Zeilen).

## Grundprinzip

- **Eine Datei** `index.html`, kein Build, keine Bibliotheken, keine Netzwerkanfragen. Läuft als `file://`.
- **Zustand** in einem Objekt `S`, gespeichert in `localStorage` unter `seeblick-pms:data:v3`.
- **Rendering** als HTML-Strings: jede Ansicht ist eine Funktion `view…()`, die `{title, html, isForm, after}`
  zurückgibt; `render()` schreibt das in `#main`.
- **Ereignisse** zentral per Delegation: Elemente tragen `data-action`, `data-change`, `data-input` oder
  `data-form`; die Tabellen `ACTIONS`, `CHANGES`, `FORMS` enthalten die Handler.
- **Domain-Logik** (`…Core`-Funktionen) ist von der Oberfläche getrennt und wird von UI **und**
  `window.hotelApi` genutzt. Daher gelten Überbuchungsschutz und Validierung überall gleich.

## Aufbau der Datei

| Zeilen | Abschnitt | Inhalt |
|---|---|---|
| `1-8` | Kopf | `lang="de" translate="no"`, `<meta name="google" content="notranslate">`, Titel |
| `9-478` | CSS | Tokens hell `:10-27`, dunkel `:29-…` (`prefers-color-scheme` + `data-theme`), App-Shell `:78`, Buttons `:126`, Karten `:161`, Tabellen `:187`, Badges `:207`, Formulare `:227`, Buchungsbestätigung `:276`, Belegungsplan `:294`, Charts `:339`, Modal `:356`, Toast `:365`, Kalender `:377`, Rechnung `:391`, Responsive `:415-452`, Print `:453-477` |
| `481-532` | SVG-Sprite | alle Icons als `<symbol id="i-…">`, genutzt über `ico('name')` |
| `534-568` | App-Shell | Sidebar (`#nav`), Topbar (Suche `#global-search`, „Verfügbarkeit prüfen“, „Neue Reservierung“, Theme, Benutzer), `#main`, `#modal-root`, `#toast-root`, `#cal-root` |
| `569-3214` | Skript (IIFE) | zehn Abschnitte, siehe unten |

### Skript-Abschnitte

| Zeilen | Nr. | Abschnitt | Wichtigste Funktionen |
|---|---|---|---|
| `578-643` | 1 | Utils | Datum (`toISO`, `addDays`, `diffDays`, `fmtDate`), `parseDateInput` `:612` (akzeptiert `14.10.2026`, `14.10.`, `14102026`, ISO), `normDate` `:626` (auch „heute“, „morgen“), `mulberry32` `:634` (Zufallsgenerator mit Seed), `norm`, `debounce` |
| `645-682` | 2 | Stammdaten | `SCHEMA`/`STORE_KEY` `:646-647`, `CATEGORIES` `:650`, `STATUS` `:659`, `BLOCKING`, `HK` (Zimmerstatus), `CHANNELS` `:676`, Zahlarten, Abteilungen, Aufgabentypen, Präferenzen, Länder |
| `684-979` | 3 | Seed | `defaultRates()` `:685`, `seedData()` `:699` |
| `981-1003` | 4 | Store | `load()` `:986`, `save()` `:995`, `resetData()` `:999`, `logAct()` (Protokoll) |
| `1005-1404` | 5 | Domain | Belegung (`isRoomFree`, `freeRooms`, `bestRoom`, `occupancy`), Preise (`nightsFor`, `stayLines`, `folioOf`, `quote`), Validierung (`validateStay` `:1110`, `validateGuestData` `:1140`), `createReservationCore` `:1169`, `updateReservationCore` `:1195`, `cancelReservationCore` `:1235`, `checkInCore` `:1249`, `checkOutCore` `:1278`, Leistungen/Zahlungen, Zimmerstatus, Aufgaben, `setRateCore`, `searchAll` `:1383` |
| `1405-1651` | 6 | UI-Infrastruktur | HTML-Helfer (`ico`, `badge`, `field` `:1419`, `dateControl`), Feldfehler, `toast` `:1450`, `openModal` `:1464`, `confirmDialog` `:1486`, Kalender-Popover `:1499-1535`, Router (`parseHash` `:1537`, `buildHash`, `go`), `NAV` `:1552`, `renderChrome` `:1567`, Theme, `render` `:1592`, `refreshAfterExternal` `:1608`, globale Suche, Benutzermenü, CSV-Download |
| `1653-2796` | 7 | Views | siehe Tabelle „Views“ |
| `2797-3068` | 8 | Aktionen & Events | `ACTIONS` `:2809`, `CHANGES` `:2895`, `FORMS` `:2913`, `bindEvents()` `:2970`, Buchungsmasken-Hooks `bfOnInput`/`bfOnChange` `:3051-3068` |
| `3069-3206` | 9 | `window.hotelApi` | DTOs, `apiRun` `:3079`, Methoden `:3096-3204` |
| `3208-3213` | 10 | Start | `applyTheme(); S = load(); bindEvents(); render();` |

## Datenmodell

Vollständige Feldliste in der README (Abschnitt „Datenmodell“). Das Wichtigste für Änderungen:

| Teil | Wo definiert | Merke |
|---|---|---|
| Kategorien | `CATEGORIES` `:650-657` (Code, Name, Kurzname, m², `maxGuests`, `maxAdults`, Betten, Ausstattung) | **Konstante im Code**, nicht im State |
| Raten | `S.ratePlans` im Seed `:725-730` (STD, FLEX, NR, BB) | Codes werden überall benutzt |
| Preise | `S.rates['DZS|HS|STD'] = 139` aus `defaultRates()` `:685` | pro Zimmer und Nacht inkl. 7 % MwSt.; Flex = +15 €, NR = −10 %, Frühstück = +18 € pro Person (max. 2) |
| Saisons | `S.seasonByMonth` `:724` (NS/ZS/HS je Monat) | |
| Zimmer | `layout` im Seed `:753` (40 Zimmer, 4 Etagen) | Zimmernummer = Etage × 100 + Position |
| Hotel-Stammdaten | `S.hotel` `:709-714` | in der UI unter Einstellungen → Hoteldaten änderbar |
| Reservierung | Objekt in `createReservationCore` `:1184-1189` | `nightly[]` friert den Preis bei Buchung ein |
| IDs | `S.counters` `:750` | `R-1001…`, `G-1001…`, `T-101…` |

**Wichtig:** `load()` (`:986`) nimmt den gespeicherten Stand, solange `schema === SCHEMA`. Änderungen am Seed
oder an `defaultRates()` wirken deshalb erst nach „Demo-Daten zurücksetzen“ oder wenn du `SCHEMA` (`:646`)
erhöhst. Das ändert auch den `localStorage`-Schlüssel.

## Seed-Generator (`seedData()` `:699-979`)

Deterministisch (`mulberry32(433170)`, `:700`), aber **relativ zum heutigen Datum** `T`. Dieselbe Datei zeigt
also an jedem Tag einen plausiblen, gefüllten Betrieb.

| Schritt | Zeilen | Was passiert |
|---|---|---|
| Stammdaten | `:707-751` | Hotel, 5 Benutzer, Saisons, Raten, 15 Artikel |
| Zimmer | `:752-761` | 40 Zimmer; 208 und 403 außer Betrieb (bis T+4 bzw. T+9); Zimmernotizen |
| Gäste | `:763-804` | 96 Profile aus Namenslisten, jeder 7. international, ~30 % mit Firma, Präferenzen, VIP |
| Reservierungen | `:805-826` | pro Zimmer eine Zeitleiste T−34 bis T+34; Auslastung sinkt mit Abstand zu heute (`occAt` `:808`); `DEMO_FREE` `:809` hält 7 Zimmer ab T+2 bewusst frei, damit Demo-Buchungen klappen |
| Stornos | `:828-833` | 34 stornierte Buchungen ohne Zimmer |
| Details je Buchung | `:834-910` | Personen je Kategorie, Kanal (u. a. „Voice Agent“ 11 %), Rate, Extras, Status nach Datum (abgereist/angereist/bestätigt/Option/No-Show), Nebenleistungen, Meldeschein |
| IDs | `:912-913` | nach Erstellzeit sortiert, dann `R-1001…` vergeben |
| Zahlungen/Rechnungen | `:915-936` | NR-Vorauszahlungen, Ausgleich bei Abreise, Rechnungsnummern `RE-JJJJ-00001` |
| Housekeeping | `:937-955` | Zimmerstatus passend zu An-/Abreisen; eine heutige Anreise bekommt absichtlich ein schmutziges Zimmer (Demo-Warnung) |
| Aufgaben, Protokoll | `:956-977` | Reinigungs-, Wartungs-, Rückrufaufgaben, Nachtaudit-Eintrag |

## Routing

Hash-Router ohne Bibliothek. `parseHash()` (`:1537`) liefert `parts` und Query `q`, `route()` (`:1654-1681`)
verteilt per `switch` auf die Views. Navigation über `go('#/…')` oder normale Links; `hashchange` schließt
offene Modals und rendert neu (`:3045`). Die Seitenleiste kommt aus `NAV` (`:1552`).

## Views

| Route | Funktion | Zeile |
|---|---|---|
| `#/dashboard` | `viewDashboard` | `:1687` |
| `#/belegungsplan` | `viewPlan` + `planDnD` (Drag & Drop) | `:1757`, `:1810` |
| `#/reservierungen` | `viewResList`, `resFilter`, `resTable` | `:1896`, `:1865` |
| `#/reservierungen/R-…` | `viewResDetail` | `:1947` |
| `#/reservierungen/neu`, `/bearbeiten` | `viewBooking` + `bf…`-Helfer | `:2016-2280` |
| `#/checkin`, `#/checkin/R-…`, `#/checkout/R-…` | `viewFrontdesk`, `viewCheckin`, `viewCheckout` | `:2282`, `:2313`, `:2387` |
| `#/gaeste`, `/G-…`, `/neu` | `viewGuests`, `viewGuest`, `viewGuestForm` | `:2414`, `:2437`, `:2462` |
| `#/zimmer`, `/101` | `viewRooms`, `viewTasks`, `viewRoom` | `:2498`, `:2527`, `:2545` |
| `#/rechnungen`, `/R-…`, `/druck` | `viewInvoices`, `viewFolio`, `viewInvoicePrint` | `:2586`, `:2603`, `:2626` |
| `#/preise` | `viewRates` | `:2648` |
| `#/berichte` | `viewReports` (SVG-Balken `svgBars`) | `:2714`, `:2672` |
| `#/einstellungen` | `viewSettings` | `:2766` |

### Buchungsmaske (wichtigste Ansicht für den Agenten)

Zustand in `BF` (`:2015`). Schritt 1 Zeitraum/Personen + Verfügbarkeitstabelle, Schritt 2 Gast, Schritt 3
Extras/Kanal/Notiz, rechts die Zusammenfassung mit „Buchung bestätigen“ (`#bf-submit`).

| Funktion | Zeile | Aufgabe |
|---|---|---|
| `viewBooking` | `:2016` | baut die Maske für neu oder bearbeiten |
| `stepper` | `:2102` | −/+-Buttons plus einstelliges Textfeld für Personen |
| `bfUpdate` | `:2129` | rechnet Nächte, zeichnet die Verfügbarkeitstabelle mit Preis-Buttons `pick-<KAT>-<RATE>`, Zimmerauswahl |
| `bfSummary` | `:2177` | Zusammenfassung rechts |
| `bfSubmit` | `:2234` | liest das Formular, ruft `createReservationCore` bzw. `updateReservationCore`, springt zur Detailseite mit `?neu=1` |
| `ACTIONS['bf-check']`, `['bf-pick']` | `:2847-2848` | „Verfügbarkeit prüfen“, Preisfeld anklicken |

## Aktionen und Events (`bindEvents()` `:2970-3048`)

| Ereignis | Verhalten |
|---|---|
| `click` | sucht das nächste `[data-action]` und ruft `ACTIONS[name](el, e)`; Tabellenzeilen mit `data-href` sind klickbar |
| `change` / `input` | `data-change` / `data-input` → `CHANGES`; Datumsfelder werden zu `TT.MM.JJJJ` normalisiert; Buchungsmaske → `bfOnChange`/`bfOnInput` |
| `focusout` | ungültiges Datum → roter Feldfehler mit Beispiel |
| `focusin` / `mouseup` | Klick in ein gefülltes Textfeld markiert den ganzen Inhalt (`:3004-3006`) |
| `submit` | `form[data-form]` → `FORMS[name]` |
| `keydown` | Strg/⌘+A, Esc, Fokusfalle in Modals, Pfeile/Enter in der Suche, Enter in Schritt 1 = Verfügbarkeit prüfen, Strg/⌘+K = Suche |
| `storage` | Änderungen aus einem anderen Tab übernehmen |

Neue Aktion anlegen: Button mit `data-action="mein-name"` rendern und in `ACTIONS` einen Eintrag
`'mein-name': el => { … ; done('Gespeichert'); rerender(); }` ergänzen. `done()` (`:2798`) speichert und zeigt
einen Toast.

## `window.hotelApi` (`:3069-3206`)

Interne JS-API, zum Beispiel für eigene Tests oder einen API-Weg. Der Computer-Use-Agent benutzt sie **nicht**;
ein eigenes Startskript kann `reset()` (Setup) und `findReservation()` (Protokoll) nutzen.

- `apiRun(mutates, fn)` (`:3079`) setzt den Akteur auf `api` (im Protokoll „Voice Agent (API)“, `:1002`),
  fängt Fehler ab, speichert bei Erfolg und aktualisiert die Oberfläche über `refreshAfterExternal()`; offene
  Formulare werden dabei nicht zerstört.
- `apiStay()`, `catCode()`, `planCode()` (`:3088-3094`) akzeptieren tolerante Eingaben
  (`from`/`arrival`/`anreise`, „Doppelzimmer Superior“ statt `DZP`, „Mit Frühstück“ statt `BB`).
- Methoden (`:3096-3204`): `help`, `getHotel`, `listCategories`, `listRatePlans`, `checkAvailability`,
  `getRates`, `createReservation`, `findReservation`, `getReservation`, `updateReservation`, `addNote`,
  `cancelReservation`, `listArrivals`, `listDepartures`, `listInhouse`, `checkIn`, `checkOut`, `addCharge`,
  `addPayment`, `findGuest`, `getGuest`, `createGuest`, `updateGuest`, `listRooms`, `setRoomStatus`,
  `listTasks`, `createTask`, `getOccupancy`, `reset`, `_state`.
- Rückgabe immer `{ok:true, …}` oder `{ok:false, code, error, field}` über `fail()` (`:1109`).

## Designregeln für Computer Use (und warum)

Der Agent sieht nur Screenshots (1280×800) und hat nur Maus und Tastatur. Jede Regel verhindert einen Fehler,
der in Tests aufgetreten ist oder typisch für Computer Use ist.

| Regel | Umsetzung | Warum |
|---|---|---|
| Keine nativen Datums-Popups | Textfeld `TT.MM.JJJJ` + eigener Kalender (`dateControl` `:1428`, `parseDateInput` `:612`) | Native Picker sind im Screenshot oft unsichtbar und schwer zu treffen; Tippen ist zuverlässig |
| Personenzahl ohne `<select>` | `stepper()` `:2102`: −/+-Buttons und einstelliges Textfeld | Aufgeklappte native Listen erscheinen nicht im Seiten-Screenshot; der Agent würde blind wählen |
| Strg+A-Fix | `keydown`-Handler `:3011-3013`: Strg+A **und** ⌘+A markieren immer alles | Unter macOS springt Strg+A sonst an den Zeilenanfang; der Agent tippt dann an den alten Wert an |
| Klick markiert Inhalt | `focusin`/`mouseup` `:3004-3006` | Erneutes Tippen ersetzt den Wert sauber, auch ohne Strg+A |
| Keine Ein-Tasten-Kürzel | Kommentar `:3043` | Ein tippender Agent ohne Feldfokus würde sonst Seiten wechseln |
| Keine `alert/confirm/prompt` | `openModal`, `confirmDialog` `:1464-1497` | Browser-Dialoge blockieren Playwright und sind nicht im Screenshot |
| Modals schließen nicht per Klick daneben | `openModal` | Ein verrutschter Klick soll keine Eingaben verwerfen |
| Feste Layouts | Zimmer-Platzhalter `roomPlaceholder()` `:2107`, „Buchung bestätigen“ fest oben in der Zusammenfassung (`position:sticky`, `:2093-2094`), Fehler ohne Auto-Scroll, Toasts unten rechts | Zwischen Screenshot und Klick darf sich nichts verschieben, sonst trifft der Klick das falsche Element |
| Sichtbar beschriftete Buttons | Text + Icon überall; Drag & Drop im Belegungsplan nur zusätzlich | Der Agent findet Aktionen über ihren Text |
| Kurze Animationen | ≤ 150 ms (CSS) | Screenshots zeigen keine Zwischenzustände |
| Keine Übersetzungsleiste | `translate="no"` + `notranslate` (`:2`, `:7`) | Chromes Leiste verschiebt sonst die Seite |
| Stabile IDs | `id`/`data-testid` (z. B. `bf-arrival`, `pick-DZS-STD`, `bf-submit`, `new-res-number`) | für Playwright-Tests, nicht für den Agenten |

**Achtung:** Weitere Felder sind noch native `<select>` (u. a. Anrede, Land, Buchungskanal `#bf-channel`,
Zimmerauswahl `#bf-room`, Listenfilter, Stornogrund). Wenn der Agent dort hängt, nach demselben Muster wie
`stepper()` auf Buttons oder Segment-Auswahl umbauen.

---

## So änderst du …

| Was | Wo | Hinweis |
|---|---|---|
| **Hotelname, Adresse, Bankdaten** | `S.hotel` im Seed `:709-714`; fest im HTML: `<title>` `:8`, Sidebar `:539`, Fenstertitel `:1602` („Seeblick PMS“) | danach zurücksetzen. Alternativ nur zur Laufzeit über Einstellungen → Hoteldaten. Den Namen auch im Prompt deines Voice Agents ändern. |
| **Branding / Farben** | CSS-Tokens `:10-27` (hell) und Dunkel-Block ab `:29`; Akzent `--accent`, Seitenleiste `--sidebar*` | Logo: `<symbol id="i-logo">` `:482` |
| **Kategorien** | `CATEGORIES` `:650-657`, Zimmerverteilung `layout` `:754`, Basispreise in `defaultRates()` `:686`, Seed-Personen je Kategorie `:848-853`, Stornoverteilung `:830` | Neue Kategorie braucht einen Eintrag in allen drei Tabellen. Den Kategorienamen auch im Prompt deines Voice Agents eintragen. |
| **Zimmeranzahl** | `layout` `:753` | auch `DEMO_FREE` `:809` und `OOO` `:757` prüfen (müssen existierende Zimmernummern sein) |
| **Preise** | `defaultRates()` `:685-698` (Basis NS/ZS/HS, Aufschläge für Flex/NR/Frühstück) | Saisons: `seasonByMonth` `:724`. Artikel/Extras: `articles` `:732-748` |
| **Raten** | `ratePlans` `:725-730` und `defaultRates()` | Raten-Codes sind in `bfUpdate`, API und Voice-Prompts verwendet |
| **Kanäle** | `CHANNELS` `:676` | „Voice Agent“ muss bleiben, der CU-Prompt wählt ihn |
| **Neue Ansicht** | 1. `function viewXyz(q){ return {title, html: pageHead(…) + …}; }` in Abschnitt 7. 2. `case 'xyz':` in `route()` `:1654`. 3. Eintrag in `NAV` `:1552` (Icon aus dem Sprite). | Für Formulare `isForm:true` zurückgeben, dann zerstören API-Änderungen die Eingaben nicht |
| **Neues Feld an Gast oder Reservierung** | 1. Seed (Gast `:791-801`, Reservierung `:864-875`). 2. Core-Funktion (`createGuestCore` `:1146`, `createReservationCore` `:1169`, Updates `:1158`/`:1195`). 3. Formular (`viewGuestForm` `:2462` bzw. `viewBooking` `:2016` + `bfSubmit` `:2234`). 4. Anzeige (`viewGuest`/`viewResDetail`). 5. ggf. DTO in `resDTO`/`guestDTO` `:3070-3078` und CSV-Export | Danach `SCHEMA` erhöhen oder zurücksetzen, sonst fehlen alte Datensätze das Feld |
| **Menge der Demo-Daten** | Gäste-Schleife `:773` (96), Zeitraum `:807` (±34 Tage), Auslastung `occAt` `:808`, Stornos `:829` (34) | |
| **Seed variieren** | Zahl in `mulberry32(433170)` `:700` | gleiche Zahl = gleiche Daten relativ zu heute |

---

## Bekannte Grenzen

Aus der README übernommen und um Code-Befunde ergänzt:

- Nur ein Browser: Daten liegen im `localStorage` des jeweiligen Profils, keine Synchronisation. Startet
  dein Agent pro Prozess ein frisches Browserprofil, beginnt er immer mit neuen Demo-Daten.
- Keine Gruppenbuchungen, keine Stornogebühren-Berechnung, keine Kartenzahlung, ein Zimmer pro Buchung.
- ~650 Reservierungen auf 96 Gäste: Stammgäste haben viele Aufenthalte in wenigen Wochen.
- Nebenleistungen pauschal 19 % (seit 01.01.2026 gälten für Speisen 7 %), pro Artikel änderbar.
- Kategorien sind Konstanten im Code, nicht in der Oberfläche pflegbar.
- Mehrere native `<select>` sind noch vorhanden (siehe Designregeln).

---

## Mit Claude Code weiterbauen

Im Ordner `hotel-demo/` Claude Code starten und zuerst sagen:
„Lies `CODE-ERKLAERUNG.md` und `README.md`. Halte die Computer-Use-Designregeln ein.“ Dann zum Beispiel:

1. **Andere Branche**
   > Baue aus dieser Demo eine Praxissoftware für die fiktive „Hausarztpraxis Dr. Jansen, Kiel“: Termine statt
   > Reservierungen, Behandlungsräume statt Zimmer, Patienten statt Gäste. Behalte Architektur, Designregeln
   > und eine `window.praxisApi` mit denselben Mustern (`apiRun`, `fail`). Erzeuge die Seed-Daten relativ zu
   > heute. Lege das als neuen Ordner `praxis-demo/` an und lass `hotel-demo/` unverändert.

2. **Neue Kategorie und Preise**
   > Füge die Kategorie „Apartment“ (Code APT, 45 m², max. 4 Personen, 3 Erwachsene) mit 3 Zimmern im
   > 4. OG hinzu, Basispreise 189/209/239 €. Passe `CATEGORIES`, `layout`, `defaultRates()` und den Seed an,
   > erhöhe `SCHEMA` und ergänze die Kategorie im Voice-Prompt.

3. **Native Selects ersetzen**
   > Ersetze in der Buchungsmaske die nativen Auswahllisten für Anrede und Buchungskanal durch sichtbare
   > Segment-Buttons wie beim `stepper()`, damit der Computer-Use-Agent sie im Screenshot sieht. Teste danach
   > mit deinem Computer-Use-Agenten eine Telefonbuchung.

4. **Neue Ansicht**
   > Baue eine Ansicht `#/warteliste`: Anrufer, für die nichts frei war, mit Name, Telefon, Wunschzeitraum und
   > Kategorie. Neuer Menüpunkt unter Front Office, Formular zum Anlegen, Button „Verfügbarkeit erneut prüfen“,
   > und eine API-Methode `hotelApi.addToWaitlist()`.

5. **Neues Feld**
   > Ergänze an der Reservierung das Feld „Ankunftszeit (ca.)“ im Format HH:MM: im Seed, in
   > `createReservationCore`/`updateReservationCore`, in Schritt 3 der Buchungsmaske, in der Detailansicht,
   > in `resDTO` und im CSV-Export. Validierung mit Feldfehler, kein natives Zeit-Popup.
