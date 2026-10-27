import asyncio
import logging
from collections import deque
from uuid import uuid4

import httpx
from jarvis_contracts import Email

logger = logging.getLogger(__name__)


class TaskError(Exception):
    """A safe German message that may be displayed in the HUD."""


class Approvals:
    def __init__(self):
        self.pending: dict[tuple[str, str], asyncio.Future] = {}

    def create(self, session_id):
        approval_id = str(uuid4())
        self.pending[session_id, approval_id] = asyncio.get_running_loop().create_future()
        return approval_id

    def resolve(self, session_id, approval_id, approved):
        future = self.pending.get((session_id, approval_id))
        if future is None or future.cancelled():
            raise ValueError("Unknown approval")
        if future.done():
            if future.result() != approved:
                raise ValueError("Approval already resolved")
        else:
            future.set_result(approved)

    async def wait(self, session_id, approval_id, timeout):
        key = session_id, approval_id
        try:
            return await asyncio.wait_for(self.pending[key], timeout)
        finally:
            self.pending.pop(key, None)


class Tasks:
    def __init__(self, gateway, agent):
        self.gateway, self.agent = gateway, agent
        self.approvals = Approvals()
        from .runs import Runs
        self.runs = Runs(gateway, self.approvals)
        self.computer: dict[tuple[str, str], asyncio.Future] = {}
        self.finished_computer = deque(maxlen=1024)

    async def execute(self, name, args, session_id):
        hub = self.gateway.hub
        if name == "resolve_approval":
            self.approvals.resolve(session_id, args["approvalId"], args["approved"])
            hub.emit("approval.resolved", {**args, "via": "voice"}, session_id)
            return args
        if name == "handle_request":
            return self.runs.start(args["instruction"], session_id)
        kind = {
            "delegate_task": "research",
            "start_computer_task": "computer_use",
            "send_email": "other",
            "place_call": "call",
        }[name]
        task_id = str(uuid4())
        title = args.get("instruction") or args.get("subject") or args.get("purpose")
        hub.emit("task.created", {"taskId": task_id, "title": title, "kind": kind}, session_id)
        self.gateway.spawn(self.run(name, args, session_id, task_id))
        return {"taskId": task_id}

    def ingest(self, event):
        payload, session_id = event["payload"], event["sessionId"]
        if event["type"] == "approval.resolved":
            self.approvals.resolve(session_id, payload["approvalId"], payload["approved"])
        if event["type"] in (
            "task.done",
            "task.failed",
            "task.progress",
            "cu.frame",
            "cu.action",
            "cu.mode",
        ):
            key = session_id, payload["taskId"]
            if key in self.finished_computer:
                return False
            future = self.computer.get(key)
            if future and event["type"] in ("task.done", "task.failed"):
                if future.done():
                    return False
                future.set_result(event)
        return True

    async def run(self, name, args, session_id, task_id):
        hub, settings = self.gateway.hub, self.gateway.settings
        try:
            if name == "start_computer_task":
                await self.run_computer(args, session_id, task_id)
                return  # The worker owns successful/failed terminal events.
            if name == "send_email":
                result = await self.send_email(args, session_id, task_id)
            elif name == "delegate_task":
                hub.emit(
                    "task.progress",
                    {"taskId": task_id, "message": f"Ich prüfe die Aufgabe, {settings.demo_user_name}."},
                    session_id,
                )
                async with asyncio.timeout(settings.task_timeout):
                    result = await self.agent.run(
                        args["instruction"], self.gateway, session_id, task_id
                    )
            else:
                response = await self.gateway.http.post(
                    settings.voice_agent_url + "/calls",
                    json={**args, "context": {"sessionId": session_id, "taskId": task_id}},
                )
                response.raise_for_status()
                result = "Anruf an den Telefonie-Agenten übergeben. Der Anrufstatus folgt separat."
            hub.emit("task.done", {"taskId": task_id, "result": result}, session_id)
        except asyncio.CancelledError:
            hub.emit(
                "task.failed",
                {"taskId": task_id, "error": "Aufgabe beim Beenden abgebrochen."},
                session_id,
            )
            raise
        except Exception as exc:
            logger.warning("Task %s failed: %s", name, type(exc).__name__)
            message = (
                str(exc)
                if isinstance(exc, TaskError)
                else (
                    "Zeitlimit erreicht. Bitte erneut versuchen."
                    if isinstance(exc, TimeoutError)
                    else "Die Aufgabe ist fehlgeschlagen. Bitte erneut versuchen."
                )
            )
            hub.emit("task.failed", {"taskId": task_id, "error": message}, session_id)

    async def send_email(self, args, session_id, task_id):
        # Register before publishing: resolution can arrive before wait starts.
        approval_id = self.approvals.create(session_id)
        self.gateway.hub.emit(
            "approval.requested",
            {
                "approvalId": approval_id,
                "title": "Mail senden?",
                "risk": "medium",
                "detail": f"An: {args['to']}\nBetreff: {args['subject']}\n\n{args['body']}",
            },
            session_id,
        )
        try:
            approved = await self.approvals.wait(
                session_id, approval_id, self.gateway.settings.approval_timeout
            )
        except TimeoutError:
            raise TaskError("Keine Freigabe erhalten. Die Mail wurde nicht gesendet.") from None
        if not approved:
            raise TaskError("Freigabe abgelehnt. Die Mail wurde nicht gesendet.")
        self.gateway.hub.emit(
            "task.progress",
            {"taskId": task_id, "message": "Freigabe erhalten. Ich sende die Mail."},
            session_id,
        )
        email = await self.gateway.request("POST", "/api/emails", json=args, model=Email)
        return f"Mail „{email['subject']}“ an {email['to']} gesendet."

    async def run_computer(self, args, session_id, task_id):
        settings = self.gateway.settings
        key = session_id, task_id
        future = asyncio.get_running_loop().create_future()
        self.computer[key] = future
        try:
            async with asyncio.timeout(settings.cu_timeout):
                response = await self.gateway.http.post(
                    settings.cu_worker_url + "/tasks",
                    json={
                        "taskId": task_id,
                        "sessionId": session_id,
                        "instruction": args["instruction"],
                        "mode": args.get("mode", "pixel"),
                    },
                )
                response.raise_for_status()
                await future
        except (httpx.HTTPError, TimeoutError, asyncio.CancelledError):
            # A worker terminal event is authoritative even if the dispatch
            # response was lost or timed out afterwards.
            if future.done() and not future.cancelled():
                return
            raise
        finally:
            self.computer.pop(key, None)
            self.finished_computer.append(key)
            # If dispatch or the worker times out, stop the still-running desktop.
            if not future.done() or future.cancelled():
                future.cancel()
                try:
                    await self.gateway.http.post(
                        settings.cu_worker_url + f"/tasks/{task_id}/cancel", timeout=2
                    )
                except httpx.HTTPError:
                    logger.warning("CU cancellation unavailable")
