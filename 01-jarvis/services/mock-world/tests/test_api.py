from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from jarvis_contracts import (
    Appointment, BriefingItemPayload, CalendarEvent, Email, Lead, Patient,
    make_event, parse_event,
)

from jarvis_mock_world.app import create_app

BERLIN = ZoneInfo("Europe/Berlin")
TODAY = date(2026, 10, 9)


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "test.db", today=lambda: TODAY)) as client:
        yield client


@pytest.mark.parametrize("path,model,count", [
    ("/api/leads", Lead, 12), ("/api/emails", Email, 12),
    ("/api/events", CalendarEvent, 10),
    ("/praxis/api/patients", Patient, 12),
    ("/praxis/api/appointments", Appointment, 29),
])
def test_contracts_and_seed_sizes(client, path, model, count):
    response = client.get(path)
    assert response.status_code == 200
    records = response.json()
    assert len(records) == count
    for record in records:
        model.model_validate(record)


def test_anchors_and_deterministic_reset(client):
    paths = ["/api/leads", "/api/emails", "/api/events", "/praxis/api/patients",
             "/praxis/api/appointments", "/api/briefing", "/api/datasets/pipeline_by_month"]
    before = [client.get(path).json() for path in paths]
    lead = client.get("/api/leads/L-007").json()
    assert {k: lead[k] for k in ("name", "company", "city", "status", "score", "valueEur")} == {
        "name": "Thomas Müller", "company": "Müller GmbH", "city": "München",
        "status": "angebot", "score": 92, "valueEur": 84000,
    }
    emails = {item["id"]: item for item in before[1]}
    for id, subject in [("M-003", "KI-Empfang: erste Eindrücke"), ("M-009", "PraxisPilot: Testzugang bereit")]:
        assert emails[id]["fromName"] == "Dr. Anna Weber"
        assert emails[id]["subject"] == subject
        assert emails[id]["unread"] is True
        assert emails[id]["priority"] == ("high" if id == "M-003" else "normal")
        assert emails[id]["leadId"] == "L-001"
    patient = client.get("/praxis/api/patients?q=Anna Weber").json()[0]
    assert patient == {"id": "P-001", "firstName": "Dr. Anna", "lastName": "Weber",
                       "birthDate": "1978-03-12", "phone": "+49 30 23125101", "insurance": "privat"}
    client.get("/api/emails/M-003")
    client.post("/api/emails", json={"to": "demo@example.test", "subject": "Test", "body": "Hallo"})
    for _ in range(2):
        assert client.post("/admin/reset").json() == {"ok": True}
        assert [client.get(path).json() for path in paths] == before


def test_filters_order_and_read_email(client):
    leads = client.get("/api/leads?status=angebot&limit=3").json()
    assert len(leads) == 3
    assert all(x["status"] == "angebot" for x in leads)
    assert [x["score"] for x in leads] == sorted([x["score"] for x in leads], reverse=True)
    emails = client.get("/api/emails?unreadOnly=true&folder=inbox&limit=8").json()
    assert len(emails) == 8 and all(x["unread"] and x["folder"] == "inbox" for x in emails)
    assert [x["receivedAt"] for x in emails] == sorted([x["receivedAt"] for x in emails], reverse=True)
    mail = client.get("/api/emails/M-003").json()
    Email.model_validate(mail)
    assert mail["unread"] is False and "from" in mail and "from_" not in mail
    assert "M-003" not in [x["id"] for x in client.get("/api/emails?unreadOnly=true").json()]
    events = client.get("/api/events?date=2026-10-09").json()
    assert len(events) == 2 and all(x["start"].startswith("2026-10-09") for x in events)


def test_send_email_and_create_event(client):
    result = client.post("/api/emails", json={"to": "anna@example.test", "subject": "Bestätigung", "body": "Bis Dienstag!"})
    assert result.status_code == 201
    mail = Email.model_validate(result.json())
    assert mail.folder == "sent" and mail.unread is False
    assert mail.id in [x["id"] for x in client.get("/api/emails?folder=sent").json()]
    result = client.post("/api/events", json={"title": "Kundengespräch", "start": "2026-10-09T15:00:00+02:00",
                                          "end": "2026-10-09T16:00:00+02:00", "leadId": "L-007"})
    assert result.status_code == 201
    event = CalendarEvent.model_validate(result.json())
    assert event.attendees == [] and event.leadId == "L-007"
    assert len(client.get("/api/events?date=2026-10-09").json()) == 3


def booking(**changes):
    return {"patientId": "P-001", "start": "2026-10-13T10:00:00+02:00", "reason": "Erstgespräch", **changes}


def test_book_reference_task_and_conflicts(client):
    slots = client.get("/praxis/api/slots?date=2026-10-13").json()
    assert {"start": "2026-10-13T10:00:00+02:00", "free": True} in slots
    result = client.post("/praxis/api/appointments", json=booking())
    assert result.status_code == 201
    appointment = Appointment.model_validate(result.json())
    assert appointment.id == "A-101" and appointment.durationMin == 30
    assert result.json() in client.get("/praxis/api/appointments").json()
    assert {"start": appointment.start, "free": False} in client.get("/praxis/api/slots?date=2026-10-13").json()
    assert client.post("/praxis/api/appointments", json=booking()).status_code == 409
    assert client.post("/praxis/api/appointments", json=booking(start="2026-10-13T09:30:00+02:00", durationMin=60)).status_code == 409
    assert client.post("/praxis/api/appointments", json=booking(start="2026-10-13T10:30:00+02:00")).status_code == 201
    assert client.post("/praxis/api/appointments", json=booking(patientId="P-404")).status_code == 404
    assert client.post("/admin/reset").status_code == 200
    assert client.post("/praxis/api/appointments", json=booking()).json()["id"] == "A-101"


def test_briefing_and_datasets_derive_from_data(client):
    items = client.get("/api/briefing").json()["items"]
    assert len(items) == 5
    assert [x["index"] for x in items] == list(range(0, 5))  # 0-based, see contracts
    for item in items:
        BriefingItemPayload.model_validate(item)
        parse_event(make_event("briefing.item", item))
    by_icon = {x["icon"]: x for x in items}
    assert by_icon["calendar"]["metric"]["value"] == 2
    unread = [x for x in client.get("/api/emails?unreadOnly=true&folder=inbox").json() if x["priority"] == "high"]
    assert by_icon["mail"]["metric"]["value"] == len(unread)
    assert "Müller GmbH" in by_icon["lead"]["detail"]
    leads = client.get("/api/leads").json()
    pipeline = sum(x["valueEur"] for x in leads if x["status"] not in ("gewonnen", "verloren"))
    assert by_icon["money"]["metric"]["value"] == pipeline
    client.get("/api/emails/M-003")
    updated = client.get("/api/briefing").json()["items"]
    assert next(x for x in updated if x["icon"] == "mail")["metric"]["value"] == len(unread) - 1
    monthly = client.get("/api/datasets/pipeline_by_month").json()
    assert len(monthly) == 6 and monthly[-1]["value"] == pipeline
    assert all(set(x) == {"label", "value"} for x in monthly)
    statuses = client.get("/api/datasets/leads_by_status").json()
    assert sum(x["value"] for x in statuses) == 12
    cities = client.get("/api/datasets/leads_by_city").json()
    # Map shows open pipeline in EUR per city (the HUD renders values as €), largest first.
    leads = client.get("/api/leads", params={"limit": 50}).json()
    open_value = sum(x["valueEur"] for x in leads if x["status"] not in ("gewonnen", "verloren"))
    assert sum(x["value"] for x in cities) == open_value
    assert [x["value"] for x in cities] == sorted((x["value"] for x in cities), reverse=True)
    assert all(set(x) == {"label", "value", "lat", "lng"} for x in cities)
    days = client.get("/api/datasets/emails_by_day").json()
    assert sum(x["value"] for x in days) == 12


@pytest.mark.parametrize("path", ["/api/leads/missing", "/api/emails/missing", "/api/datasets/missing"])
def test_unknown_resource(client, path):
    assert client.get(path).status_code == 404


@pytest.mark.parametrize("path", ["/api/leads?limit=-1", "/api/leads?status=oops", "/api/emails?folder=oops",
                                     "/api/events?date=oops", "/praxis/api/slots?date=oops"])
def test_invalid_queries(client, path):
    assert client.get(path).status_code == 422


@pytest.mark.parametrize("payload", [booking(reason=""), booking(durationMin=0), booking(start="oops"),
    booking(start="2026-10-13T10:00:00"), booking(start="2026-10-13T23:00:00+02:00")])
def test_invalid_appointments(client, payload):
    assert client.post("/praxis/api/appointments", json=payload).status_code == 422


def test_invalid_writes(client):
    assert client.post("/api/emails", json={"to": "", "subject": "", "body": ""}).status_code == 422
    assert client.post("/api/events", json={"title": "Test", "start": "2026-10-09T15:00:00+02:00",
                                          "end": "2026-10-09T14:00:00+02:00"}).status_code == 422


def test_persistence_and_real_day(tmp_path):
    path = tmp_path / "persistent.db"
    with TestClient(create_app(path)) as client:
        today = datetime.now(BERLIN).date()
        # The seed has meetings on workdays only (Mon to Fri).
        expected = 2 if today.weekday() < 5 else 0
        assert len(client.get(f"/api/events?date={today}").json()) == expected
        client.get("/api/emails/M-003")
    with TestClient(create_app(path)) as client:
        assert "M-003" not in [x["id"] for x in client.get("/api/emails?unreadOnly=true").json()]


@pytest.mark.parametrize("day", [date(2026, 10, 13), date(2026, 10, 24), date(2026, 12, 31)])
def test_next_tuesday_across_day_and_dst(tmp_path, day):
    with TestClient(create_app(tmp_path / "date.db", today=lambda: day)) as client:
        next_tuesday = day + timedelta(days=(1 - day.weekday()) % 7 or 7)
        slots = client.get(f"/praxis/api/slots?date={next_tuesday}").json()
        ten = next(x for x in slots if datetime.fromisoformat(x["start"]).hour == 10)
        assert ten["free"] is True
        assert datetime.fromisoformat(ten["start"]).utcoffset() == datetime.combine(next_tuesday, datetime.min.time(), BERLIN).utcoffset()


def test_concurrent_booking_is_atomic(client):
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=10) as pool:
        responses = list(pool.map(lambda _: client.post("/praxis/api/appointments", json=booking()), range(10)))
    assert sorted(response.status_code for response in responses) == [201] + [409] * 9
    created = [x for x in client.get("/praxis/api/appointments?date=2026-10-13").json() if x["id"] == "A-101"]
    assert len(created) == 1


def test_normalize_utc_and_validate_foreign_keys(client):
    result = client.post("/praxis/api/appointments", json=booking(start="2026-10-13T08:00:00Z"))
    assert result.status_code == 201
    assert result.json()["start"] == "2026-10-13T10:00:00+02:00"
    assert client.post("/praxis/api/appointments", json=booking()).status_code == 409
    assert client.post("/api/events", json={"title": "Test", "start": "2026-10-09T23:00:00Z",
        "end": "2026-10-10T00:00:00Z", "leadId": "L-missing"}).status_code == 404
    event = client.post("/api/events", json={"title": "Nach Mitternacht", "start": "2026-10-09T23:00:00Z",
        "end": "2026-10-10T00:00:00Z"}).json()
    assert event["start"] == "2026-10-10T01:00:00+02:00"
    assert event in client.get("/api/events?date=2026-10-10").json()


@pytest.mark.parametrize("dataset,kind", [("pipeline_by_month", "bar_chart"), ("leads_by_status", "bar_chart"),
    ("leads_by_city", "map"), ("emails_by_day", "line_chart")])
def test_datasets_can_be_embedded_in_widget_events(client, dataset, kind):
    data = client.get(f"/api/datasets/{dataset}").json()
    parse_event(make_event("ui.widget", {"widgetId": dataset, "kind": kind, "title": dataset, "data": data}))


def test_incoming_mail_lands_unread_on_top_of_the_inbox(client):
    before = len(client.get("/api/emails?folder=inbox").json())
    response = client.post("/admin/incoming-mail")
    assert response.status_code == 201
    mail = Email.model_validate(response.json())
    assert (mail.fromName, mail.subject, mail.priority, mail.unread, mail.folder) == (
        "Thomas Müller", "Unterschrift heute möglich?", "high", True, "inbox")
    assert mail.from_ == "thomas.mueller@mueller.test"
    inbox = client.get("/api/emails?folder=inbox").json()
    assert inbox[0]["id"] == mail.id
    assert len(inbox) == before + 1
    # Every call is a new mail; the briefing counts it as urgent.
    second = client.post("/admin/incoming-mail", json={"subject": "Noch eine Frage", "priority": "normal"}).json()
    assert second["id"] != mail.id and second["subject"] == "Noch eine Frage" and second["priority"] == "normal"
    urgent = client.get("/api/briefing").json()["items"][1]["metric"]["value"]
    client.post("/admin/reset")
    assert client.get("/api/briefing").json()["items"][1]["metric"]["value"] == urgent - 1
    assert client.post("/admin/incoming-mail", json={"priority": "kritisch"}).status_code == 422
