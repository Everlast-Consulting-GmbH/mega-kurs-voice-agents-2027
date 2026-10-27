import asyncio
import logging
from time import perf_counter
from urllib.parse import quote
from uuid import uuid4

import httpx
from jarvis_contracts import BriefingItemPayload, CalendarEvent, ChatMessage, Email, Lead, ToolResult
from pydantic import TypeAdapter

from .config import Settings, today
from .contracts import validate_input
from .events import EventHub

logger = logging.getLogger(__name__)


def validated(model, value):
    return TypeAdapter(model).dump_python(
        TypeAdapter(model).validate_python(value), mode="json", by_alias=True, exclude_unset=True
    )



def _count(n, one, many, none):
    return none if n == 0 else f"{n} {one if n == 1 else many} geladen"


def summarize(name, args, value):
    """One German line for the HUD timeline/terminal (tool.finished.summary)."""
    if isinstance(value, dict) and "taskId" in value:
        return "Aufgabe angenommen"
    if name == "list_leads":
        return _count(len(value), "Lead", "Leads", "Keine Leads gefunden")
    if name == "list_emails":
        return _count(len(value), "Mail", "Mails", "Keine Mails gefunden")
    if name == "list_events":
        return _count(len(value), "Termin", "Termine", "Keine Termine gefunden")
    if name == "get_briefing":
        return f"{len(value.get('items', []))} Punkte im Briefing"
    if name == "get_lead":
        return f"Lead {value.get('company', '')}".strip()
    if name == "read_email":
        return f"Mail: {value.get('subject', '')}".strip()
    if name == "render_widget":
        return f"Anzeige: {value.get('title', '')}".strip()
    if name == "focus_entity":
        return f"Fokus: {args.get('label', '')}".strip()
    if name == "create_event":
        return f"Termin angelegt: {value.get('title', '')}".strip()
    if name == "resolve_approval":
        return "Freigabe erteilt" if args.get("approved") else "Freigabe abgelehnt"
    return "Erledigt"

class Gateway:
    def __init__(self, settings: Settings, hub: EventHub, http: httpx.AsyncClient):
        self.settings, self.hub, self.http = settings, hub, http
        self.background: set[asyncio.Task] = set()
        self.tasks = None
        self.resetting = False

    def spawn(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.background.add(task)
        task.add_done_callback(self._completed)
        return task

    def _completed(self, task):
        self.background.discard(task)
        if not task.cancelled() and task.exception():
            # Do not log upstream bodies, prompts or secrets.
            logger.error("Background job failed: %s", type(task.exception()).__name__)

    async def close(self):
        tasks = list(self.background)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def request(self, method: str, path: str, *, model=None, **kwargs):
        response = await self.http.request(method, self.settings.mock_world_url + path, **kwargs)
        response.raise_for_status()
        value = response.json()
        return validated(model, value) if model else value

    async def call(self, name: str, args: dict, session_id="demo", task_id=None) -> dict:
        args = validate_input(name, args)
        call_id, start = str(uuid4()), perf_counter()
        extra = {"taskId": task_id} if task_id else {}
        self.hub.emit(
            "tool.started", dict(callId=call_id, tool=name, args=args, **extra), session_id
        )
        try:
            value = await self.execute(name, args, session_id)
            result = {"ok": True, "result": value}
            summary = summarize(name, args, value)
        except asyncio.CancelledError:
            summary = "Tool-Aufruf abgebrochen."
            result = {"ok": False, "error": summary}
            raise
        except Exception as exc:
            logger.warning("Tool %s failed: %s", name, type(exc).__name__)
            summary = "Das Tool konnte nicht ausgeführt werden. Bitte erneut versuchen."
            result = {"ok": False, "error": summary}
        finally:
            self.hub.emit(
                "tool.finished",
                dict(
                    callId=call_id,
                    tool=name,
                    ok=result["ok"],
                    summary=summary,
                    durationMs=round((perf_counter() - start) * 1000, 2),
                    **extra,
                ),
                session_id,
            )
        return validated(ToolResult, result)

    async def execute(self, name, args, session_id):
        if self.resetting:
            raise ValueError("Demo reset in progress")
        if name == "reply_email":
            return await self.request("POST", "/api/emails/" + quote(args["emailId"], safe="") + "/reply", json={"body": args["body"]}, model=Email)
        if name == "post_message":
            return await self.request("POST", "/api/chat", params={"channel": args["channel"]}, json={"text": args["text"]}, model=ChatMessage)
        if name == "move_deal":
            return await self.request("PATCH", "/api/leads/" + quote(args["leadId"], safe=""), json={"status": args["status"]}, model=Lead)
        if name == "list_leads":
            return await self.request("GET", "/api/leads", params=args, model=list[Lead])
        if name == "get_lead":
            return await self.request(
                "GET", "/api/leads/" + quote(args["leadId"], safe=""), model=Lead
            )
        if name == "list_emails":
            return await self.request("GET", "/api/emails", params={**args, "folder": "inbox"}, model=list[Email])
        if name == "read_email":
            return await self.request(
                "GET", "/api/emails/" + quote(args["emailId"], safe=""), model=Email
            )
        if name == "list_events":
            return await self.request(
                "GET",
                "/api/events",
                params={"date": args.get("date", today())},
                model=list[CalendarEvent],
            )
        if name == "create_event":
            return await self.request("POST", "/api/events", json=args, model=CalendarEvent)
        if name == "focus_entity":
            self.hub.emit("ui.focus", args, session_id)
            return args
        if name == "render_widget":
            data = await self.request("GET", "/api/datasets/" + args["dataset"])
            payload = dict(
                widgetId=str(uuid4()),
                kind=args.get("kind", "map" if args["dataset"] == "leads_by_city" else "bar_chart"),
                title=args.get(
                    "title",
                    {
                        "pipeline_by_month": "Pipeline nach Monat",
                        "leads_by_status": "Leads nach Status",
                        "leads_by_city": "Leads nach Stadt",
                        "emails_by_day": "Mails nach Tag",
                    }[args["dataset"]],
                ),
                data=data,
            )
            self.hub.emit("ui.widget", payload, session_id)
            return payload
        if name == "get_briefing":
            data = await self.request("GET", "/api/briefing")
            items = validated(list[BriefingItemPayload], data["items"])
            self.spawn(self.briefing(items, session_id))
            return {"items": items}
        if self.tasks:
            return await self.tasks.execute(name, args, session_id)
        raise ValueError("Unknown tool")

    async def notice(self, kind, session_id):
        """Stage trigger: something urgent happens, the HUD alerts and Jarvis interrupts."""
        if kind != "urgent-mail":
            raise KeyError(kind)
        mail = await self.request("POST", "/admin/incoming-mail", model=Email)
        notice = self.hub.emit(
            "notice",
            dict(
                noticeId=f"n-{uuid4().hex[:8]}",  # short: shown in the HUD terminal
                severity="urgent",
                title=f"Dringende Mail von {mail['fromName']}",
                detail=mail["subject"],
                entity="mail",
                entityId=mail["id"],
            ),
            session_id,
        )["payload"]
        self.hub.emit(
            "ui.focus", dict(entity="mail", entityId=mail["id"], label=mail["subject"]), session_id
        )
        return {"ok": True, "notice": notice, "email": mail}

    async def briefing(self, items, session_id):
        for index, item in enumerate(items):
            if index:
                await asyncio.sleep(self.settings.briefing_interval)
            self.hub.emit("briefing.item", item, session_id)
            # BriefingItem has no entity ID. Fetch real records instead of inventing
            # a focus or assuming a demo anchor is still the highest-priority item.
            try:
                if item["icon"] == "lead":
                    rows = await self.request(
                        "GET", "/api/leads", params={"limit": 1}, model=list[Lead]
                    )
                    entity, label = "lead", "company"
                elif item["icon"] == "mail":
                    rows = await self.request(
                        "GET",
                        "/api/emails",
                        params={"limit": 1, "unreadOnly": True},
                        model=list[Email],
                    )
                    entity, label = "mail", "subject"
                elif item["icon"] == "calendar":
                    rows = await self.request(
                        "GET", "/api/events", params={"date": today()}, model=list[CalendarEvent]
                    )
                    entity, label = "event", "title"
                else:
                    continue
                if rows:
                    self.hub.emit(
                        "ui.focus",
                        dict(entity=entity, entityId=rows[0]["id"], label=rows[0][label]),
                        session_id,
                    )
            except (httpx.HTTPError, ValueError):
                logger.warning("Briefing focus unavailable")
