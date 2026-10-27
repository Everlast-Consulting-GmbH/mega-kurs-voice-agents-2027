"""One deterministic, fictional agency story; dates follow the Berlin demo day."""

import os
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo("Europe/Berlin")
PRACTITIONER = "Dr. Felix Berg"
STATUSES = ["neu", "qualifiziert", "angebot", "verhandlung", "gewonnen", "verloren"]
CHANNELS = ("allgemein", "vertrieb", "delivery")


def user_name():
    return os.getenv("DEMO_USER_NAME", "Leo").strip() or "Leo"


def stamp(day: date, hour: int, minute: int = 0) -> str:
    return datetime.combine(day, time(hour, minute), BERLIN).isoformat()


def next_tuesday(day: date) -> date:
    return day + timedelta(days=(1 - day.weekday()) % 7 or 7)


def seed_records(today: date) -> dict[str, list[dict]]:
    user = user_name()
    # Stable IDs are shared with the screenplay and the computer-use reference task.
    rows = [
        (
            "L-001",
            "Dr. Anna Weber",
            "Hausarztpraxis Weber",
            "anna.weber@praxis.test",
            "München",
            48.137,
            11.576,
            "gewonnen",
            18000,
            75,
            "KI-Empfang in PraxisPilot testen",
            "Bestandskundin. PraxisPilot hat keine API; Testtermin am nächsten Dienstag um 10 Uhr.",
        ),
        (
            "L-002",
            "Nils Hansen",
            "Hansa Kliniken",
            "nils.hansen@hansa.test",
            "Hamburg",
            53.551,
            9.994,
            "angebot",
            120000,
            81,
            "Datenschutzkonzept für die Zentrale abstimmen",
            "KI-Telefonassistenz für drei Klinikstandorte; Freigabe des Datenschutzes steht aus.",
        ),
        (
            "L-003",
            "Sarah Klein",
            "Brandt AG",
            "sarah.klein@brandt.test",
            "Stuttgart",
            48.775,
            9.182,
            "qualifiziert",
            48000,
            77,
            "Workshop-Termine im Q4 vorschlagen",
            "Zwei Workshops zu interner Wissenssuche und Angebotsautomatisierung.",
        ),
        (
            "L-004",
            "Lena Peters",
            "Nordlicht Logistik",
            "lena.peters@nordlicht.test",
            "Bremen",
            53.079,
            8.801,
            "qualifiziert",
            31000,
            72,
            "Rückfragen der Disposition sammeln",
            "Telefonassistent soll Lieferstatus nennen und Rückrufwünsche aufnehmen.",
        ),
        (
            "L-005",
            "Paul Richter",
            "Isar Immobilien",
            "paul.richter@isar.test",
            "München",
            48.137,
            11.576,
            "angebot",
            24000,
            68,
            "Angebot für Besichtigungsassistenz besprechen",
            "Start mit Vermietung, Kalenderanbindung an zwei Makler.",
        ),
        (
            "L-006",
            "Eva Hoffmann",
            "Rheinblick Hotel",
            "eva.hoffmann@rheinblick.test",
            "Köln",
            50.938,
            6.960,
            "verhandlung",
            22000,
            70,
            "Pilot auf Abenddienst begrenzen",
            "Rezeption möchte deutschsprachige Buchungsanfragen nach 18 Uhr abfangen.",
        ),
        (
            "L-007",
            "Thomas Müller",
            "Müller GmbH",
            "thomas.mueller@mueller.test",
            "München",
            48.137,
            11.576,
            "angebot",
            84000,
            92,
            "Unterschrift heute um 15 Uhr vorbereiten",
            "Maschinenbau. KI-Telefonassistent für Ersatzteilservice. Angebot über 84.000 € ist intern freigegeben; Unterschrift im Call heute um 15 Uhr möglich.",
        ),
        (
            "L-008",
            "David Sommer",
            "Elbwerk Energie",
            "david.sommer@elbwerk.test",
            "Hamburg",
            53.551,
            9.994,
            "neu",
            36000,
            54,
            "Erstgespräch zum Zählerservice führen",
            "Anfragen zum Zählerwechsel telefonisch vorsortieren.",
        ),
        (
            "L-009",
            "Nora Fischer",
            "Bergmann Steuerberatung",
            "nora.fischer@bergmann.test",
            "Berlin",
            52.520,
            13.405,
            "gewonnen",
            16000,
            66,
            "Monatlichen Qualitätsbericht schicken",
            "KI-Empfang seit September aktiv, Fokus auf Rückruflisten.",
        ),
        (
            "L-010",
            "Jan Vogt",
            "Linden Apotheke",
            "jan.vogt@linden.test",
            "Leipzig",
            51.340,
            12.373,
            "gewonnen",
            12000,
            61,
            "Abholungshinweise aktualisieren",
            "Assistent beantwortet Öffnungszeiten und nimmt Vorbestellungen auf.",
        ),
        (
            "L-011",
            "Clara Wolf",
            "Mainblick Architektur",
            "clara.wolf@mainblick.test",
            "Frankfurt",
            50.110,
            8.682,
            "verloren",
            19000,
            35,
            "Im nächsten Budgetjahr erneut sprechen",
            "Projekt wegen verschobenem Büroausbau auf Eis gelegt.",
        ),
        (
            "L-012",
            "Ben Hartmann",
            "Weser Mobilität",
            "ben.hartmann@weser.test",
            "Bremen",
            53.079,
            8.801,
            "neu",
            28000,
            49,
            "Werkstattprozesse aufnehmen",
            "Serviceannahme möchte Termine und Ersatzwagen koordinieren.",
        ),
    ]
    fields = (
        "id",
        "name",
        "company",
        "email",
        "city",
        "lat",
        "lng",
        "status",
        "valueEur",
        "score",
        "nextStep",
        "notes",
    )
    leads = [
        dict(
            zip(fields, row),
            phone=f"+49 30 23125{n:03}",
            lastContactAt=stamp(today - timedelta(days=n % 4), 10),
        )
        for n, row in enumerate(rows, 1)
    ]
    by_id = {x["id"]: x for x in leads}
    mail_rows = [
        (
            "L-002",
            "Datenschutzkonzept für drei Standorte",
            "Unser Datenschutzteam benötigt noch die Aufbewahrungsfristen und die Beschreibung der EU-Datenhaltung. Können Sie uns das bis Mittwoch schicken?",
        ),
        (
            "L-003",
            "Workshop-Termine Q4",
            "Für unsere beiden Workshops passen Mittwoch oder Donnerstag. Bitte planen Sie zuerst die Wissenssuche mit sechs Teilnehmenden ein.",
        ),
        (
            "L-001",
            "KI-Empfang: erste Eindrücke",
            "Der KI-Empfang nimmt Rückrufwünsche bereits gut auf. Am Dienstag um zehn möchte ich die Terminübergabe in PraxisPilot testen. Können Sie einen Testtermin für mich anlegen?",
        ),
        (
            "L-004",
            "Rückfragen aus der Disposition",
            "Die Disposition hat zwölf typische Anruferfragen gesammelt. Wichtig ist uns die Übergabe an den Bereitschaftsdienst bei verspäteten Lieferungen.",
        ),
        (
            "L-005",
            "Besichtigungsassistenz: zwei Kalender",
            "Das Angebot liegt bei unserer Geschäftsführung. Bitte berücksichtigen Sie zwei Kalender und eine Rückfrage nach dem gewünschten Stadtteil.",
        ),
        (
            "L-006",
            "Pilot im Abenddienst",
            "Wir möchten mit dem Abenddienst starten. Wenn die Weiterleitung an die Rezeption klappt, erweitern wir den Pilot nach zwei Wochen.",
        ),
        (
            "L-007",
            "Unterschrift heute möglich?",
            "Wir sind intern durch. Wenn ihr heute um 15 Uhr könnt, unterschreiben wir direkt im Call. Die 84.000 Euro für den KI-Telefonassistenten sind freigegeben.",
        ),
        (
            "L-008",
            "Zählerservice: Erstgespräch",
            "Können wir nächste Woche die häufigsten Anfragen zum Zählerwechsel durchgehen? Unser Team bringt anonymisierte Beispiele mit.",
        ),
        (
            "L-001",
            "PraxisPilot: Testzugang bereit",
            "Jonas hat den Testzugang für PraxisPilot. Die Anwendung bietet keine API. Bitte den Testtermin am Dienstag um zehn direkt in der Oberfläche eintragen.",
        ),
        (
            "L-009",
            "Qualitätsbericht September",
            "Die Rückruflisten helfen unserem Empfang. Für den nächsten Bericht interessiert uns besonders die Erreichbarkeit am Montagmorgen.",
        ),
        (
            "L-010",
            "Abholungshinweis aktualisieren",
            "Bitte ergänzt den Hinweis, dass reservierte Medikamente ab 15 Uhr abgeholt werden können. Unsere Öffnungszeiten bleiben gleich.",
        ),
        (
            "L-012",
            "Ablauf in der Serviceannahme",
            "Bei einem Werkstatttermin fragen wir nach Kennzeichen, Anliegen und Ersatzwagen. Diese drei Punkte möchten wir im Erstgespräch besprechen.",
        ),
    ]
    emails = []
    for n, (lead_id, subject, body) in enumerate(mail_rows, 1):
        lead = by_id[lead_id]
        emails.append(
            dict(
                id=f"M-{n:03}",
                **{"from": lead["email"]},
                fromName=lead["name"],
                to="team@jarvis.test",
                subject=subject,
                body=f"Hallo {user},\n\n{body}\n\nViele Grüße\n{lead['name']}",
                receivedAt=stamp(today, 8, 50 - n),
                unread=True,
                priority="high" if n in (3, 7) else "normal",
                leadId=lead_id,
                folder="inbox",
            )
        )
    events = []
    meetings = [
        ("Dr. Weber · KI-Empfang Onboarding", "L-001"),
        ("Hansa Kliniken · Datenschutz", "L-002"),
        ("Brandt AG · Workshop-Abstimmung", "L-003"),
        ("Nordlicht · Dispositionsfragen", "L-004"),
        ("Q4 · Pipeline-Review", None),
    ]
    for offset, (title, lead_id) in enumerate(meetings):
        day = today - timedelta(days=today.weekday()) + timedelta(days=offset)
        for hour, minute, name, ref in [
            (9, 30, "Team-Standup · Mara und Jonas", None),
            (11, 0, title, lead_id),
        ]:
            events.append(
                {
                    "id": f"E-{len(events) + 1:03}",
                    "title": name,
                    "start": stamp(day, hour, minute),
                    "end": (
                        datetime.fromisoformat(stamp(day, hour, minute))
                        + timedelta(minutes=30)
                    ).isoformat(),
                    "location": "Videokonferenz",
                    "attendees": ["team@jarvis.test", by_id[ref]["email"]]
                    if ref
                    else ["team@jarvis.test", "mara@jarvis.test", "jonas@jarvis.test"],
                    "leadId": ref,
                }
            )
    people = [
        ("Dr. Anna", "Weber"),
        ("Klara", "Bauer"),
        ("Felix", "Schuster"),
        ("Mia", "Keller"),
        ("Lukas", "Winter"),
        ("Emma", "Schmid"),
        ("Anton", "Lang"),
        ("Laura", "Neumann"),
        ("Simon", "Beck"),
        ("Hannah", "Koch"),
        ("Max", "Huber"),
        ("Lina", "Wagner"),
    ]
    patients = [
        {
            "id": f"P-{n:03}",
            "firstName": first,
            "lastName": last,
            "birthDate": f"{1977 + n}-03-12",
            "phone": f"+49 30 23125{100 + n:03}",
            "insurance": "privat" if n == 1 else "gesetzlich",
        }
        for n, (first, last) in enumerate(people, 1)
    ]
    appointments = [
        {
            "id": f"A-{offset + 15:03}",
            "patientId": f"P-{(offset + 14) % 11 + 2:03}",
            "practitioner": PRACTITIONER,
            "start": stamp(today + timedelta(days=offset), 9),
            "durationMin": 30,
            "reason": "Kontrolltermin",
            "status": "bestaetigt",
        }
        for offset in range(-14, 15)
    ]
    chats = [
        (
            "allgemein",
            "Leo",
            "Guten Morgen! Heute konzentrieren wir uns auf Müller und den KI-Empfang der Praxis Weber.",
        ),
        (
            "vertrieb",
            "Mara",
            "Hat Müller sich schon gemeldet? Die 84.000 € sind unser wichtigster Abschluss diese Woche.",
        ),
        (
            "delivery",
            "Jonas",
            "PraxisPilot-Testzugang ist bereit. Dr. Weber kann Dienstag um 10 Uhr den KI-Empfang testen.",
        ),
        (
            "vertrieb",
            "Mara",
            "Sarah Klein braucht Q4-Workshop-Termine. Bei Hansa fehlt noch das Datenschutzkonzept.",
        ),
        (
            "delivery",
            "Jonas",
            "Für Müller halte ich ab Mittwoch Kapazität für die Telefonassistenz frei.",
        ),
        (
            "allgemein",
            "Mara",
            "Pipeline-Review am Freitag. Bitte offene Rückfragen bis Donnerstag sammeln.",
        ),
    ]
    chat = [
        {
            "id": f"C-{n:03}",
            "channel": channel,
            "author": user if author == "Leo" else author,
            "text": text,
            "sentAt": stamp(today, 9, n),
            "fromJarvis": False,
        }
        for n, (channel, author, text) in enumerate(chats, 1)
    ]
    return {
        "leads": leads,
        "emails": emails,
        "events": events,
        "patients": patients,
        "appointments": appointments,
        "chat": chat,
    }
