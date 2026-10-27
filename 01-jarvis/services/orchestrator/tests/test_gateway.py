import json
import re

import pytest
import respx
from fastapi.testclient import TestClient
from jarvis_contracts import ToolResult, make_event, parse_event
from jarvis_orchestrator.app import create_app
from jarvis_orchestrator.config import Settings

LEAD = dict(
    id="L-007",
    name="Thomas Müller",
    company="Müller GmbH",
    email="thomas@example.test",
    phone="+493023125000",
    city="München",
    lat=48.1,
    lng=11.5,
    status="angebot",
    valueEur=84000,
    score=92,
    lastContactAt="2026-10-09T09:00:00+02:00",
    nextStep="Angebot nachfassen",
    notes="Demo",
)
EMAIL = {
    "id": "M-003",
    "from": "anna@example.test",
    "fromName": "Dr. Anna Weber",
    "to": "leo@example.test",
    "subject": "Angebot?",
    "body": "Bitte ein Angebot.",
    "receivedAt": "2026-10-09T09:00:00+02:00",
    "unread": True,
    "priority": "high",
    "leadId": None,
    "folder": "inbox",
}
EVENT = dict(
    id="E-001",
    title="Gespräch",
    start="2026-10-09T10:00:00+02:00",
    end="2026-10-09T11:00:00+02:00",
    location="Büro",
    attendees=[],
    leadId="L-007",
)
ITEMS = [
    dict(
        index=i,
        total=2,
        icon="lead" if i == 0 else "mail",
        title="Wichtige Leads" if i == 0 else "Wichtige Mails",
        detail="Aktuelle Daten",
    )
    for i in range(2)
]


@pytest.fixture
def client():
    with TestClient(create_app(Settings(briefing_interval=0.01))) as client:
        yield client


def receive_until(ws, event_type):
    events = []
    for _ in range(30):
        event = ws.receive_json()
        parse_event(event)
        events.append(event)
        if event["type"] == event_type:
            return events
    pytest.fail(f"Missing {event_type}")


def test_catalog_and_validation(client):
    catalog = client.get("/tools").json()
    assert len(catalog) == 18
    assert all("inputSchema" in item and "needsApproval" in item for item in catalog)
    assert client.get("/health").json() == {"ok": True}
    assert client.post("/tools/list_leads", json={"limit": 0}).status_code == 422
    assert client.post("/tools/get_lead", json={}).status_code == 422
    assert client.post("/tools/missing", json={}).status_code == 404


@pytest.mark.parametrize(
    "name,args,method,path,response",
    [
        ("list_leads", {"status": "angebot", "limit": 3}, "GET", "/api/leads", [LEAD]),
        ("get_lead", {"leadId": "L-007"}, "GET", "/api/leads/L-007", LEAD),
        ("list_emails", {"unreadOnly": True}, "GET", "/api/emails", [EMAIL]),
        ("read_email", {"emailId": "M-003"}, "GET", "/api/emails/M-003", EMAIL),
        ("list_events", {"date": "2026-10-09"}, "GET", "/api/events", [EVENT]),
        (
            "create_event",
            {k: EVENT[k] for k in ("title", "start", "end")},
            "POST",
            "/api/events",
            EVENT,
        ),
    ],
)
@respx.mock
def test_fast_tools(client, name, args, method, path, response):
    route = respx.route(method=method, url__regex=f"http://localhost:8700{path}.*").respond(
        json=response
    )
    with client.websocket_connect("/events?sessionId=demo") as ws:
        result = client.post(f"/tools/{name}", json=args)
        assert result.status_code == 200
        assert ToolResult.model_validate(result.json()).ok
        assert result.json()["result"] == response
        events = receive_until(ws, "tool.finished")
    assert [e["type"] for e in events] == ["tool.started", "tool.finished"]
    assert events[0]["payload"]["callId"] == events[-1]["payload"]["callId"]
    assert events[-1]["payload"]["durationMs"] >= 0
    request = route.calls.last.request
    if method == "GET":
        expected = {
            k: str(v).lower() if isinstance(v, bool) else str(v)
            for k, v in args.items()
            if k not in ("leadId", "emailId")
        }
        if name == "list_emails":
            expected["folder"] = "inbox"
        assert dict(request.url.params) == expected
    else:
        assert json.loads(request.content) == args


@respx.mock
def test_focus_widget_and_briefing(client):
    respx.get("http://localhost:8700/api/datasets/pipeline_by_month").respond(
        json=[{"label": "Okt", "value": 84000}]
    )
    respx.get("http://localhost:8700/api/briefing").respond(json={"items": ITEMS})
    respx.get("http://localhost:8700/api/leads").respond(json=[LEAD])
    respx.get("http://localhost:8700/api/emails").respond(json=[EMAIL])
    with client.websocket_connect("/events") as ws:
        result = client.post(
            "/tools/focus_entity",
            json={"entity": "lead", "entityId": "L-007", "label": LEAD["company"]},
        ).json()
        assert ToolResult.model_validate(result).ok
        assert [e["type"] for e in receive_until(ws, "tool.finished")] == [
            "tool.started",
            "ui.focus",
            "tool.finished",
        ]
        result = client.post("/tools/render_widget", json={"dataset": "pipeline_by_month"}).json()
        assert ToolResult.model_validate(result).ok
        events = receive_until(ws, "tool.finished")
        assert events[1]["type"] == "ui.widget"
        assert events[1]["payload"]["data"][0]["value"] == 84000
        result = client.post("/tools/get_briefing", json={}).json()
        assert result["result"] == {"items": ITEMS}
        assert receive_until(ws, "tool.finished")[-1]["type"] == "tool.finished"
        events = receive_until(ws, "ui.focus")
        assert any(e["type"] == "briefing.item" for e in events)
        assert events[-1]["payload"]["entityId"] == "L-007"
        assert receive_until(ws, "ui.focus")[-1]["payload"]["entityId"] == "M-003"


@respx.mock
def test_urgent_mail_notice_emits_notice_and_focus(client):
    incoming = {**EMAIL, "id": "M-061", "subject": "Dringend: Rückruf heute?"}
    route = respx.post("http://localhost:8700/admin/incoming-mail").respond(201, json=incoming)
    with client.websocket_connect("/events?sessionId=stage") as ws:
        response = client.post("/demo/notice/urgent-mail?sessionId=stage")
        assert response.status_code == 200
        assert route.call_count == 1
        notice, focus = ws.receive_json(), ws.receive_json()
    assert notice["type"] == "notice" and notice["sessionId"] == "stage"
    assert re.fullmatch(r"n-[0-9a-f]{8}", notice["payload"]["noticeId"])
    assert notice["payload"] == {
        "noticeId": notice["payload"]["noticeId"],
        "severity": "urgent",
        "title": "Dringende Mail von Dr. Anna Weber",
        "detail": "Dringend: Rückruf heute?",
        "entity": "mail",
        "entityId": "M-061",
    }
    assert focus["type"] == "ui.focus"
    assert focus["payload"] == {"entity": "mail", "entityId": "M-061", "label": "Dringend: Rückruf heute?"}
    assert response.json() == {"ok": True, "notice": notice["payload"], "email": incoming}


@respx.mock
def test_notice_rejects_unknown_kinds_and_reports_upstream_failure(client):
    assert client.post("/demo/notice/feueralarm").status_code == 404
    respx.post("http://localhost:8700/admin/incoming-mail").respond(503, text="secret upstream body")
    response = client.post("/demo/notice/urgent-mail")
    assert response.status_code == 502
    assert "secret" not in response.text


def test_event_ingest_and_session_isolation(client):
    with client.websocket_connect("/events?sessionId=demo") as ws:
        other = make_event("voice.state", {"state": "thinking"}, "other")
        event = make_event("voice.state", {"state": "listening"})
        assert client.post("/events", json=other).status_code == 202
        assert client.post("/events", json=event).status_code == 202
        assert ws.receive_json() == event
        assert client.post("/events", json={"type": "garbage"}).status_code == 422
        ws.send_json(event)  # Client may only send approval.resolved.
        client.post("/events", json=make_event("voice.state", {"state": "idle"}))
        assert ws.receive_json()["payload"]["state"] == "idle"


@respx.mock
def test_upstream_failure_has_matching_finished(client):
    respx.get("http://localhost:8700/api/leads").respond(503, text="secret upstream body")
    with client.websocket_connect("/events") as ws:
        result = client.post("/tools/list_leads", json={}).json()
        assert not ToolResult.model_validate(result).ok
        assert "secret" not in json.dumps(result)
        events = receive_until(ws, "tool.finished")
        assert not events[-1]["payload"]["ok"]


def test_mcp_catalog_and_execution(client):
    headers = {"Accept": "application/json, text/event-stream"}
    init = client.post(
        "/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1"},
            },
        },
    )
    assert init.status_code == 200
    response = client.post(
        "/mcp",
        headers=headers,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    tools = response.json()["result"]["tools"]
    catalog = client.get("/tools").json()
    assert {t["name"]: t["inputSchema"] for t in tools} == {
        t["name"]: t["inputSchema"] for t in catalog
    }
    with client.websocket_connect("/events?sessionId=mcp-test") as ws:
        response = client.post(
            "/mcp?sessionId=mcp-test",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "focus_entity",
                    "arguments": {"entity": "lead", "entityId": "L-007", "label": "Müller GmbH"},
                },
            },
        )
        assert json.loads(response.json()["result"]["content"][0]["text"])["ok"]
        assert receive_until(ws, "tool.finished")[1]["type"] == "ui.focus"


@respx.mock
def test_websocket_approval_sends_only_once(client):
    route = respx.post("http://localhost:8700/api/emails").respond(json={**EMAIL, "folder": "sent"})
    with client.websocket_connect("/events") as ws:
        client.post(
            "/tools/send_email", json={"to": EMAIL["to"], "subject": "Termin", "body": "Bestätigt"}
        )
        requested = receive_until(ws, "approval.requested")[-1]
        resolution = make_event(
            "approval.resolved",
            {"approvalId": requested["payload"]["approvalId"], "approved": True, "via": "click"},
        )
        ws.send_json(resolution)
        ws.send_json(resolution)
        assert receive_until(ws, "task.done")[-1]["type"] == "task.done"
    assert route.call_count == 1


@respx.mock
def test_invalid_upstream_domain_data_is_not_returned_as_success(client):
    respx.get("http://localhost:8700/api/leads/L-007").respond(json={"id": "L-007"})
    assert not client.post("/tools/get_lead", json={"leadId": "L-007"}).json()["ok"]


def test_hub_strips_null_optionals_for_the_ts_contract():
    from jarvis_orchestrator.events import EventHub

    raw = {
        "id": "x", "ts": 1, "sessionId": "demo", "type": "briefing.item",
        "payload": {"index": 0, "total": 5, "icon": "calendar", "title": "t", "detail": "d",
                    "metric": {"label": "Termine", "value": 2, "unit": None}},
    }
    assert "unit" not in EventHub().publish(raw)["payload"]["metric"]


@pytest.mark.parametrize(
    "name, args, value, expected",
    [
        ("list_leads", {}, [{"id": "L-1"}, {"id": "L-2"}], "2 Leads geladen"),
        ("list_emails", {}, [{"id": "M-1"}], "1 Mail geladen"),
        ("list_events", {}, [], "Keine Termine gefunden"),
        ("get_briefing", {}, {"items": [1, 2, 3, 4, 5]}, "5 Punkte im Briefing"),
        ("get_lead", {}, {"company": "Müller GmbH"}, "Lead Müller GmbH"),
        ("read_email", {}, {"subject": "Angebot?"}, "Mail: Angebot?"),
        ("render_widget", {}, {"title": "Pipeline nach Monat"}, "Anzeige: Pipeline nach Monat"),
        ("focus_entity", {"label": "Müller GmbH"}, {}, "Fokus: Müller GmbH"),
        ("create_event", {}, {"title": "Kickoff"}, "Termin angelegt: Kickoff"),
        ("start_computer_task", {}, {"taskId": "k"}, "Aufgabe angenommen"),
    ],
)
def test_tool_summaries_are_specific(name, args, value, expected):
    from jarvis_orchestrator.gateway import summarize

    assert summarize(name, args, value) == expected


def test_cors_allows_the_hud_on_any_local_port(client):
    for origin, allowed in [("http://localhost:3000", True), ("http://localhost:13000", True), ("http://127.0.0.1:3001", True), ("https://evil.example", False)]:
        r = client.options("/demo/notice/urgent-mail", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
        assert (r.headers.get("access-control-allow-origin") == origin) is allowed, origin
