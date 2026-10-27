# ruff: noqa: F811
from jarvis_contracts import ChatMessage
from test_api import client  # noqa: F401


def test_story_relations_and_mutations(client):
    leads = client.get("/api/leads").json()
    assert 10 <= len(leads) <= 14
    companies = {x["company"]: x for x in leads}
    for company, value, status in [
        ("Müller GmbH", 84000, "angebot"),
        ("Hausarztpraxis Weber", 18000, "gewonnen"),
        ("Hansa Kliniken", 120000, "angebot"),
        ("Brandt AG", 48000, "qualifiziert"),
        ("Nordlicht Logistik", 31000, "qualifiziert"),
    ]:
        assert (companies[company]["valueEur"], companies[company]["status"]) == (
            value,
            status,
        )
    incoming = client.post("/admin/incoming-mail").json()
    assert incoming["leadId"] == companies["Müller GmbH"]["id"]
    assert incoming["from"] == companies["Müller GmbH"]["email"]
    assert incoming["subject"] == "Unterschrift heute möglich?"
    reply = client.post(
        f"/api/emails/{incoming['id']}/reply", json={"body": "Sehr gern, bis 15 Uhr!"}
    ).json()
    assert reply["folder"] == "sent" and reply["to"] == incoming["from"]
    assert (
        reply["leadId"] == incoming["leadId"]
        and reply["subject"] == "Re: " + incoming["subject"]
    )
    assert reply["fromName"] == "Leo"
    for channel in ["allgemein", "vertrieb", "delivery"]:
        assert client.get("/api/chat", params={"channel": channel}).json()
    message = client.post(
        "/api/chat?channel=vertrieb", json={"text": "Müller ist bereit."}
    ).json()
    ChatMessage.model_validate(message)
    assert message["fromJarvis"] and message["author"] == "Jarvis"
    assert message in client.get("/api/chat?channel=vertrieb").json()
    before = client.get("/api/datasets/leads_by_status").json()
    changed = client.patch("/api/leads/L-007", json={"status": "verhandlung"}).json()
    assert changed["status"] == "verhandlung" and changed["valueEur"] == 84000
    assert client.get("/api/datasets/leads_by_status").json() != before
    client.post("/admin/reset")
    assert client.get("/api/leads/L-007").json()["status"] == "angebot"
    assert message not in client.get("/api/chat?channel=vertrieb").json()


def test_story_invalid_writes_and_cors(client):
    assert (
        client.post("/api/emails/missing/reply", json={"body": "Hallo"}).status_code
        == 404
    )
    assert (
        client.patch("/api/leads/missing", json={"status": "angebot"}).status_code
        == 404
    )
    assert client.patch("/api/leads/L-007", json={"status": "fake"}).status_code == 422
    assert (
        client.post("/api/chat?channel=unknown", json={"text": "Hallo"}).status_code
        == 422
    )
    assert (
        client.post("/api/chat?channel=vertrieb", json={"text": "  "}).status_code
        == 422
    )
    res = client.options(
        "/api/chat",
        headers={
            "Origin": "http://localhost:3100",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.headers["access-control-allow-origin"] == "http://localhost:3100"


def test_demo_user_name(client, monkeypatch):
    monkeypatch.setenv("DEMO_USER_NAME", "Lena")
    client.post("/admin/reset")
    assert "Lena" in client.get("/api/briefing").json()["items"][0]["title"]
    mail = client.post("/api/emails/M-007/reply", json={"body": "Bis gleich."}).json()
    assert mail["fromName"] == "Lena"


def test_calendar_is_a_work_week(client):
    from datetime import datetime

    events = client.get("/api/events").json()
    assert (
        len({datetime.fromisoformat(e["start"]).isocalendar().week for e in events})
        == 1
    )
    assert all(datetime.fromisoformat(e["start"]).weekday() < 5 for e in events)
