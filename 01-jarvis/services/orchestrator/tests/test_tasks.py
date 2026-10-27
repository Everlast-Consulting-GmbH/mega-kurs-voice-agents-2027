import asyncio
import json
from contextlib import asynccontextmanager

import httpx
import pytest
import respx
from jarvis_contracts import ToolResult, make_event
from jarvis_orchestrator.app import create_app
from jarvis_orchestrator.config import Settings
from jarvis_orchestrator.tasks import Approvals
from test_gateway import EMAIL


@asynccontextmanager
async def runtime(settings=None, agent=None, session="demo"):
    app = create_app(settings or Settings(), agent=agent)
    async with app.router.lifespan_context(app):
        with app.state.hub.subscribe(session) as queue:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app), base_url="http://orchestrator"
            ) as client:
                yield app, client, queue


async def until(queue, kind):
    events = []
    async with asyncio.timeout(2):
        while True:
            event = await queue.get()
            events.append(event)
            if event["type"] == kind:
                return events


async def test_approval_before_wait_and_cross_session():
    approvals = Approvals()
    approval_id = approvals.create("demo")
    with pytest.raises(ValueError):
        approvals.resolve("other", approval_id, True)
    approvals.resolve("demo", approval_id, True)
    approvals.resolve("demo", approval_id, True)
    with pytest.raises(ValueError):
        approvals.resolve("demo", approval_id, False)
    assert await approvals.wait("demo", approval_id, 0.1)
    with pytest.raises(ValueError):
        approvals.resolve("demo", approval_id, True)


@pytest.mark.parametrize("approved,via", [(True, "tool"), (False, "tool"), (True, "event")])
@respx.mock
async def test_send_email_approval(approved, via):
    route = respx.post("http://localhost:8700/api/emails").respond(json={**EMAIL, "folder": "sent"})
    async with runtime() as (_, client, queue):
        body = {"to": EMAIL["to"], "subject": "Bestätigung", "body": "Termin bestätigt."}
        accepted = (await client.post("/tools/send_email", json=body)).json()
        assert ToolResult.model_validate(accepted).ok
        task_id = accepted["result"]["taskId"]
        events = await until(queue, "approval.requested")
        assert [e["type"] for e in events[:3]] == ["tool.started", "task.created", "tool.finished"]
        assert not route.called
        approval_id = events[-1]["payload"]["approvalId"]
        if via == "tool":
            resolved = await client.post(
                "/tools/resolve_approval", json={"approvalId": approval_id, "approved": approved}
            )
        else:
            resolved = await client.post(
                "/events",
                json=make_event(
                    "approval.resolved",
                    {"approvalId": approval_id, "approved": approved, "via": "click"},
                ),
            )
        assert resolved.json()["ok"]
        terminal = (await until(queue, "task.done" if approved else "task.failed"))[-1]
        assert terminal["payload"]["taskId"] == task_id
        assert route.call_count == int(approved)
        if approved:
            assert json.loads(route.calls.last.request.content) == body
    assert route.call_count == int(approved)


@respx.mock(assert_all_called=False)
async def test_approval_timeout_and_unknown_approval():
    route = respx.post("http://localhost:8700/api/emails").respond(json=EMAIL)
    async with runtime(Settings(approval_timeout=0.01)) as (_, client, queue):
        assert not (
            await client.post(
                "/tools/resolve_approval", json={"approvalId": "invented", "approved": True}
            )
        ).json()["ok"]
        await client.post("/tools/send_email", json={"to": "x", "subject": "x", "body": "x"})
        assert "Freigabe" in (await until(queue, "task.failed"))[-1]["payload"]["error"]
        assert not route.called


@respx.mock
async def test_computer_task_early_completion():
    async with runtime() as (_, client, queue):

        async def worker(request):
            payload = json.loads(request.content)
            assert payload["instruction"] == "Dr. Anna Weber: nächster Dienstag 10:00 Erstgespräch"
            assert payload["mode"] == "pixel"
            # Worker can finish before its POST /tasks response reaches the gateway.
            await client.post(
                "/events",
                json=make_event(
                    "task.done", {"taskId": payload["taskId"], "result": "Termin A-101 angelegt."}
                ),
            )
            return httpx.Response(202)

        respx.post("http://localhost:8800/tasks").mock(side_effect=worker)
        result = (
            await client.post(
                "/tools/start_computer_task",
                json={"instruction": "Dr. Anna Weber: nächster Dienstag 10:00 Erstgespräch"},
            )
        ).json()
        assert ToolResult.model_validate(result).ok
        events = await until(queue, "task.done")
        assert events[1]["payload"]["kind"] == "computer_use"
        assert events[-1]["payload"]["taskId"] == result["result"]["taskId"]


@respx.mock
async def test_computer_timeout_cancels_and_ignores_late_result():
    respx.post("http://localhost:8800/tasks").respond(202)
    cancel = respx.post(url__regex=r"http://localhost:8800/tasks/.*/cancel").respond(200)
    async with runtime(Settings(cu_timeout=0.02)) as (app, client, queue):
        result = (
            await client.post(
                "/tools/start_computer_task", json={"instruction": "Test", "mode": "assisted"}
            )
        ).json()
        task_id = result["result"]["taskId"]
        events = await until(queue, "task.failed")
        assert events[-1]["payload"]["taskId"] == task_id
        await asyncio.sleep(0.02)
        assert cancel.called
        await client.post(
            "/events", json=make_event("task.done", {"taskId": task_id, "result": "Zu spät"})
        )
        assert queue.empty()


@respx.mock
async def test_call_forwarding():
    route = respx.post("http://localhost:8900/calls").respond(202)
    async with runtime(session="call-demo") as (_, client, queue):
        accepted = (
            await client.post(
                "/tools/place_call?sessionId=call-demo",
                json={"to": "me", "purpose": "Termin bestätigen"},
            )
        ).json()
        assert ToolResult.model_validate(accepted).ok
        await until(queue, "task.done")
        payload = json.loads(route.calls.last.request.content)
        assert payload["context"] == {
            "sessionId": "call-demo",
            "taskId": accepted["result"]["taskId"],
        }


async def test_delegate_is_immediate_and_progress_then_done():
    gate = asyncio.Event()

    class Agent:
        async def run(self, instruction, gateway, session_id, task_id):
            assert instruction == "Fasse die drei wichtigsten Leads zusammen"
            await gate.wait()
            gateway.hub.emit(
                "task.progress", {"taskId": task_id, "message": "Leads geladen."}, session_id
            )
            return "Leo, Müller GmbH steht mit 84.000 Euro in der Angebotsphase."

    async with runtime(agent=Agent()) as (_, client, queue):
        accepted = (
            await client.post(
                "/tools/delegate_task",
                json={"instruction": "Fasse die drei wichtigsten Leads zusammen"},
            )
        ).json()
        assert ToolResult.model_validate(accepted).ok
        events = await until(queue, "tool.finished")
        assert [e["type"] for e in events] == ["tool.started", "task.created", "tool.finished"]
        gate.set()
        events = await until(queue, "task.done")
        assert any(e["type"] == "task.progress" for e in events)
        assert "84.000" in events[-1]["payload"]["result"]


async def test_delegate_timeout():
    class Agent:
        async def run(self, *args):
            await asyncio.Event().wait()

    async with runtime(Settings(task_timeout=0.01), agent=Agent()) as (_, client, queue):
        await client.post("/tools/delegate_task", json={"instruction": "Test"})
        assert "Zeitlimit" in (await until(queue, "task.failed"))[-1]["payload"]["error"]


async def test_delegate_without_key_fails_cleanly():
    async with runtime() as (_, client, queue):
        await client.post("/tools/delegate_task", json={"instruction": "Test"})
        assert "ANTHROPIC_API_KEY" in (await until(queue, "task.failed"))[-1]["payload"]["error"]


@pytest.mark.parametrize("terminal", ["task.done", "task.failed"])
@respx.mock
async def test_worker_terminal_wins_over_dispatch_failure(terminal):
    async with runtime() as (app, client, queue):

        async def worker(request):
            task_id = json.loads(request.content)["taskId"]
            payload = {
                "taskId": task_id,
                "result" if terminal == "task.done" else "error": "Worker-Ergebnis",
            }
            await client.post("/events", json=make_event(terminal, payload))
            raise httpx.ReadTimeout("Response lost", request=request)

        respx.post("http://localhost:8800/tasks").mock(side_effect=worker)
        await client.post("/tools/start_computer_task", json={"instruction": "Test"})
        # Drain the real background task, then inspect every emitted event.
        await asyncio.gather(*app.state.gateway.background)
        events = []
        while not queue.empty():
            events.append(queue.get_nowait())
        assert [e["type"] for e in events if e["type"] in ("task.done", "task.failed")] == [
            terminal
        ]


@respx.mock
async def test_delegate_timeout_finishes_inner_tool():
    async def slow_world(request):
        await asyncio.sleep(1)
        return httpx.Response(200, json=[])

    respx.get("http://localhost:8700/api/leads").mock(side_effect=slow_world)

    class Agent:
        async def run(self, instruction, gateway, session_id, task_id):
            await gateway.call("list_leads", {}, session_id, task_id)
            return "Fertig"

    async with runtime(Settings(task_timeout=0.01), agent=Agent()) as (_, client, queue):
        await client.post("/tools/delegate_task", json={"instruction": "Test"})
        events = await until(queue, "task.failed")
        inner = [
            e
            for e in events
            if e["type"] in ("tool.started", "tool.finished")
            and e["payload"]["tool"] == "list_leads"
        ]
        assert [e["type"] for e in inner] == ["tool.started", "tool.finished"]
        assert inner[-1]["payload"]["ok"] is False
        assert inner[0]["payload"]["callId"] == inner[-1]["payload"]["callId"]
