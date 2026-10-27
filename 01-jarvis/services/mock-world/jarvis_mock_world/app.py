"""REST boundary for the fictional Jarvis demo world."""
from collections import Counter
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
import os
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from jarvis_contracts import Appointment, BriefingItemPayload, CalendarEvent, ChatMessage, Email, Lead, Patient
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

from .seed import BERLIN, CHANNELS, PRACTITIONER, STATUSES, next_tuesday, stamp, user_name
from .store import Store, put, records

SERVICE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"
Nonempty = Annotated[str, Field(min_length=1, max_length=10000)]
Status = Literal["neu", "qualifiziert", "angebot", "verhandlung", "gewonnen", "verloren"]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SendEmail(Input):
    to: Nonempty
    subject: Nonempty
    body: Nonempty


class IncomingMail(Input):
    """Stage trigger: a new mail arrives while Jarvis is running."""
    fromName: Nonempty = "Thomas Müller"
    from_: Nonempty = Field("thomas.mueller@mueller.test", alias="from")
    subject: Nonempty = "Unterschrift heute möglich?"
    body: Nonempty = Field(default_factory=lambda: f"Hallo {user_name()}, wir sind intern durch. Wenn ihr heute um 15 Uhr könnt, unterschreiben wir direkt im Call. Die 84.000 Euro für den KI-Telefonassistenten sind freigegeben. Viele Grüße, Thomas Müller")
    priority: Literal["low", "normal", "high"] = "high"


class ReplyEmail(Input):
    body: Nonempty


class MoveDeal(Input):
    status: Status


class PostMessage(Input):
    text: Nonempty


class CreateEvent(Input):
    title: Nonempty
    start: AwareDatetime
    end: AwareDatetime
    attendees: list[str] = Field(default_factory=list)
    leadId: str | None = None

    @model_validator(mode="after")
    def valid_interval(self):
        if self.end <= self.start:
            raise ValueError("Das Ende muss nach dem Beginn liegen.")
        return self


class CreateAppointment(Input):
    patientId: Nonempty
    practitioner: Literal["Dr. Felix Berg"] = PRACTITIONER
    start: AwareDatetime
    durationMin: Annotated[int, Field(ge=30, le=120, multiple_of=30)] = 30
    reason: Nonempty

    @field_validator("start")
    @classmethod
    def normalize_start(cls, value):
        return value.astimezone(BERLIN)

    @model_validator(mode="after")
    def during_opening_hours(self):
        end = self.start + timedelta(minutes=self.durationMin)
        if self.start.hour < 8 or end > self.start.replace(hour=18, minute=0, second=0, microsecond=0):
            raise ValueError("Termine sind von 08:00 bis 18:00 Uhr möglich.")
        if self.start.minute not in (0, 30) or self.start.second or self.start.microsecond:
            raise ValueError("Bitte einen freien Halbstunden-Termin wählen.")
        return self


class Briefing(BaseModel):
    items: list[BriefingItemPayload]


class Slot(BaseModel):
    start: str
    free: bool


def pipeline(leads):
    return sum(x["valueEur"] for x in leads if x["status"] not in ("gewonnen", "verloren"))


def conflicts(appointments, start, duration, practitioner=PRACTITIONER):
    end = start + timedelta(minutes=duration)
    return any(
        x["status"] != "abgesagt" and x["practitioner"] == practitioner
        and datetime.fromisoformat(x["start"]) < end
        and datetime.fromisoformat(x["start"]) + timedelta(minutes=x["durationMin"]) > start
        for x in appointments
    )


def create_app(db_path=None, *, today=None):
    clock = today or (lambda: datetime.now(BERLIN).date())
    store = Store(Path(db_path or os.environ.get("MOCK_WORLD_DB", SERVICE_DIR / "data/world.sqlite")))

    @asynccontextmanager
    async def lifespan(app):
        store.initialize(clock())
        yield

    app = FastAPI(title="Jarvis Mock-World", lifespan=lifespan)
    app.state.store = store
    app.add_middleware(CORSMiddleware, allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
                       allow_methods=["GET", "POST", "PATCH", "OPTIONS"], allow_headers=["*"])

    def find(values, id):
        value = next((x for x in values if x["id"] == id), None)
        if value is None:
            raise HTTPException(404, "Eintrag nicht gefunden.")
        return value

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/admin/reset")
    def reset():
        store.reset(clock())
        return {"ok": True}

    @app.post("/admin/incoming-mail", response_model=Email, status_code=201)
    def incoming_mail(body: IncomingMail | None = None):
        body = body or IncomingMail()
        with store.connect(write=True) as db:
            # Newest in the inbox even if seed data is dated ahead of the wall clock.
            # Today's date of the world clock, wall-clock time of day.
            now = datetime.combine(clock(), datetime.now(BERLIN).timetz())
            newest = max((datetime.fromisoformat(x["receivedAt"]) for x in records(db, "emails")), default=now)
            received = max(now, newest + timedelta(seconds=1))
            return put(db, "emails", dict(id=store.next_id(db, "emails", "M"), **{"from": body.from_},
                fromName=body.fromName, to="team@jarvis.test", subject=body.subject, body=body.body,
                receivedAt=received.isoformat(), unread=True, priority=body.priority, leadId=next((x["id"] for x in records(db, "leads") if x["email"] == body.from_), None), folder="inbox"))

    @app.get("/api/leads", response_model=list[Lead])
    def leads(status: Status | None = None, limit: int = Query(100, ge=1, le=1000)):
        values = [x for x in store.all("leads") if not status or x["status"] == status]
        return sorted(values, key=lambda x: (-x["score"], x["id"]))[:limit]

    @app.get("/api/leads/{id}", response_model=Lead)
    def lead(id: str):
        return find(store.all("leads"), id)

    @app.get("/api/emails", response_model=list[Email])
    def emails(unreadOnly: bool = False, limit: int = Query(100, ge=1, le=1000), folder: Literal["inbox", "sent"] | None = None):
        values = [x for x in store.all("emails") if (not unreadOnly or x["unread"]) and (not folder or x["folder"] == folder)]
        return sorted(values, key=lambda x: (x["receivedAt"], x["id"]), reverse=True)[:limit]

    @app.get("/api/emails/{id}", response_model=Email)
    def email(id: str):
        with store.connect(write=True) as db:
            value = find(records(db, "emails"), id)
            value["unread"] = False
            return put(db, "emails", value)

    @app.post("/api/emails", response_model=Email, status_code=201)
    def send_email(body: SendEmail):
        with store.connect(write=True) as db:
            return put(db, "emails", dict(id=store.next_id(db, "emails", "M"), **body.model_dump(),
                **{"from": "team@jarvis.test"}, fromName=user_name(), receivedAt=datetime.now(BERLIN).isoformat(),
                unread=False, priority="normal", leadId=None, folder="sent"))

    @app.post("/api/emails/{id}/reply", response_model=Email, status_code=201)
    def reply_email(id: str, body: ReplyEmail):
        with store.connect(write=True) as db:
            original = find(records(db, "emails"), id)
            if original["folder"] != "inbox":
                raise HTTPException(409, "Nur auf eingegangene Mails antworten.")
            original["unread"] = False
            put(db, "emails", original)
            subject = original["subject"]
            return put(db, "emails", dict(id=store.next_id(db, "emails", "M"),
                **{"from": "team@jarvis.test"}, fromName=user_name(), to=original["from"],
                subject=subject if subject.lower().startswith("re:") else "Re: " + subject,
                body=body.body, receivedAt=datetime.now(BERLIN).isoformat(), unread=False,
                priority="normal", leadId=original["leadId"], folder="sent"))

    @app.patch("/api/leads/{id}", response_model=Lead)
    def move_deal(id: str, body: MoveDeal):
        with store.connect(write=True) as db:
            lead = find(records(db, "leads"), id)
            lead["status"] = body.status
            return put(db, "leads", lead)

    @app.get("/api/chat", response_model=list[ChatMessage])
    def chat(channel: Literal["allgemein", "vertrieb", "delivery"] | None = None):
        return sorted([x for x in store.all("chat") if channel is None or x["channel"] == channel], key=lambda x: (x["sentAt"], x["id"]))

    @app.post("/api/chat", response_model=ChatMessage, status_code=201)
    def post_message(body: PostMessage, channel: Literal["allgemein", "vertrieb", "delivery"] = Query(...)):
        with store.connect(write=True) as db:
            return put(db, "chat", dict(id=store.next_id(db, "chat", "C"), channel=channel,
                author="Jarvis", text=body.text, sentAt=datetime.now(BERLIN).isoformat(), fromJarvis=True))

    @app.get("/api/events", response_model=list[CalendarEvent])
    def events(day: date | None = Query(None, alias="date")):
        return sorted([x for x in store.all("events") if day is None or datetime.fromisoformat(x["start"]).date() == day], key=lambda x: x["start"])

    @app.post("/api/events", response_model=CalendarEvent, status_code=201)
    def create_event(body: CreateEvent):
        with store.connect(write=True) as db:
            if body.leadId:
                find(records(db, "leads"), body.leadId)
            return put(db, "events", dict(id=store.next_id(db, "events", "E"), title=body.title,
                start=body.start.astimezone(BERLIN).isoformat(), end=body.end.astimezone(BERLIN).isoformat(),
                location="Videokonferenz", attendees=body.attendees, leadId=body.leadId))

    @app.get("/praxis/api/context")
    def praxis_context():
        return {"today": clock().isoformat(), "nextTuesday": next_tuesday(clock()).isoformat(),
                "practitioner": PRACTITIONER, "timezone": "Europe/Berlin"}

    @app.get("/praxis/api/patients", response_model=list[Patient])
    def patients(q: str = ""):
        terms = q.casefold().split()
        return [x for x in store.all("patients") if all(term in f"{x['firstName']} {x['lastName']} {x['id']}".casefold() for term in terms)]

    @app.get("/praxis/api/slots", response_model=list[Slot])
    def slots(day: date = Query(..., alias="date")):
        appointments = store.all("appointments")
        starts = [datetime.fromisoformat(stamp(day, hour, minute)) for hour in range(8, 18) for minute in (0, 30)]
        return [dict(start=start.isoformat(), free=not conflicts(appointments, start, 30)) for start in starts]

    @app.get("/praxis/api/appointments", response_model=list[Appointment])
    def appointments(day: date | None = Query(None, alias="date")):
        return sorted([x for x in store.all("appointments") if day is None or datetime.fromisoformat(x["start"]).date() == day], key=lambda x: x["start"])

    @app.post("/praxis/api/appointments", response_model=Appointment, status_code=201)
    def create_appointment(body: CreateAppointment):
        with store.connect(write=True) as db:
            find(records(db, "patients"), body.patientId)
            if conflicts(records(db, "appointments"), body.start, body.durationMin, body.practitioner):
                raise HTTPException(409, "Dieser Termin ist bereits belegt. Bitte eine andere Uhrzeit wählen.")
            return put(db, "appointments", dict(id=store.next_id(db, "appointments", "A"),
                **body.model_dump(mode="json"), status="bestaetigt"))

    @app.get("/api/datasets/{dataset}")
    def dataset(dataset: str):
        with store.connect() as db:
            all_leads = records(db, "leads")
            if dataset == "pipeline_by_month":
                return [dict(label=month, value=value) for month, value in db.execute("SELECT month,value FROM history ORDER BY month")] + [dict(label=clock().strftime("%Y-%m"), value=pipeline(all_leads))]
            if dataset == "leads_by_status":
                counts = Counter(x["status"] for x in all_leads)
                return [dict(label=status, value=counts[status]) for status in STATUSES]
            if dataset == "leads_by_city":
                # Open pipeline in EUR per city; the HUD renders map values as currency.
                sums = Counter()
                for x in all_leads:
                    if x["status"] not in ("gewonnen", "verloren"):
                        sums[x["city"]] += x["valueEur"]
                cities = {x["city"]: (x["lat"], x["lng"]) for x in all_leads}
                return [dict(label=city, lat=cities[city][0], lng=cities[city][1], value=value) for city, value in sums.most_common()]
            if dataset == "emails_by_day":
                counts = Counter(x["receivedAt"][:10] for x in records(db, "emails"))
                return [dict(label=day, value=value) for day, value in sorted(counts.items())]
        raise HTTPException(404, "Datensatz nicht gefunden.")

    @app.get("/api/briefing", response_model=Briefing)
    def briefing():
        with store.connect() as db:
            all_leads, all_mails, all_events = [records(db, kind) for kind in ("leads", "emails", "events")]
            previous = db.execute("SELECT value FROM history ORDER BY month DESC LIMIT 1").fetchone()[0]
        today_events = [x for x in all_events if x["start"][:10] == clock().isoformat()]
        urgent = [x for x in all_mails if x["folder"] == "inbox" and x["unread"] and x["priority"] == "high"]
        hottest = max(all_leads, key=lambda x: x["score"])
        total = pipeline(all_leads)
        change = (total / previous - 1) * 100
        data = [
            ("calendar", f"Dein Tag, {user_name()}", f"{len(today_events)} Termine stehen heute an.", "Termine heute", len(today_events), None),
            ("mail", "Dringende Nachrichten", f"{len(urgent)} wichtige Mails warten auf deine Antwort.", "Dringend und ungelesen", len(urgent), None),
            ("lead", "Dein heißester Lead", f"{hottest['name']} von {hottest['company']}: {hottest['nextStep']}.", "Lead-Score", hottest["score"], "/100"),
            ("money", "Deine offene Pipeline", f"{change:+.1f}".replace(".", ",") + f" % gegenüber dem Vormonat ({previous:,.0f} €).".replace(",", "."), "Pipeline", total, "€"),
            ("task", "Dein Team", "Mara betreut den Vertrieb, Jonas bereitet den KI-Empfang und die Delivery vor.", "Team-Kanäle", len(CHANNELS), None),
        ]
        return {"items": [dict(index=n, total=5, icon=icon, title=title, detail=detail,
            metric=dict(label=label, value=value, unit=unit)) for n, (icon, title, detail, label, value, unit) in enumerate(data)]}

    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
        for name in ("mail", "crm", "praxis"):
            # Factory avoids exposing the filename as a query parameter.
            def page(filename=name):
                def respond():
                    return FileResponse(STATIC_DIR / f"{filename}.html")
                return respond
            app.add_api_route(f"/{name}", page(), methods=["GET"], include_in_schema=False)
    return app


app = create_app()
