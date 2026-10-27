"""Minimal local test page, not a replacement for PraxisPilot."""

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from jarvis_contracts import parse_event

app = FastAPI()
rows = []
events = []


@app.get("/praxis", response_class=HTMLResponse)
def page():
    return Path(__file__).with_name("praxis.html").read_text()


@app.post("/admin/reset")
def reset():
    rows.clear()
    events.clear()
    return {"ok": True}


@app.get("/praxis/api/appointments")
def appointments():
    return rows


@app.post("/praxis/api/appointments")
def create_appointment(body: dict):
    start = datetime.fromisoformat(body["date"] + "T" + body["time"]).replace(
        tzinfo=ZoneInfo("Europe/Berlin")
    )
    row = dict(
        id=f"A-{101 + len(rows)}",
        patientId="P-001",
        practitioner="Dr. Schmidt",
        start=start.isoformat(),
        durationMin=30,
        reason=body["reason"],
        status="geplant",
    )
    rows.append(row)
    return row


@app.post("/events")
def ingest(event: dict):
    parse_event(event)
    events.append(event)
    return {"ok": True}


@app.get("/received-events")
def received_events():
    return events


@app.get("/praxis/api/slots")
def slots(date: str):
    return [dict(start=date + "T10:00:00+02:00", free=True)]
