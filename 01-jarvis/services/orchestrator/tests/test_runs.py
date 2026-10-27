import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import date

import httpx
import pytest
from jarvis_contracts import parse_event
from jarvis_mock_world.app import create_app as world_app
from test_tasks import runtime, until

from jarvis_orchestrator.config import Settings


@pytest.fixture
def scene(tmp_path, monkeypatch):
    monkeypatch.setattr("jarvis_orchestrator.runs.today", lambda: "2026-10-12")

    @asynccontextmanager
    async def enter():
        world = world_app(tmp_path / "story.db", today=lambda: date(2026, 10, 12))
        async with world.router.lifespan_context(world):
            async with runtime(Settings(run_action_interval=0.001, planning_timeout=0.03)) as (
                app,
                client,
                queue,
            ):
                async with httpx.AsyncClient(
                    transport=httpx.ASGITransport(app=world), base_url="http://localhost:8700"
                ) as world_http:
                    app.state.gateway.http = world_http
                    try:
                        yield app, client, queue, world_http
                    finally:
                        await app.state.gateway.close()

    return enter


async def start(client, queue):
    result = (
        await client.post(
            "/tools/handle_request", json={"instruction": "Kümmer dich um die Müller GmbH"}
        )
    ).json()
    assert result["ok"]
    events = await until(queue, "approval.requested")
    plan = next(e["payload"] for e in events if e["type"] == "run.planned")
    assert len(plan["steps"]) == 4
    assert plan["approvalId"] == events[-1]["payload"]["approvalId"]
    return plan, events


async def test_parallel_run_writes_only_after_one_approval(scene):
    async with scene() as scene:
        app, client, queue, world = scene
        before = {
            p: (await world.get("/api/" + p)).json() for p in ["emails", "events", "chat", "leads"]
        }
        plan, events = await start(client, queue)
        assert not any(e["type"] == "agent.spawned" for e in events)
        assert before == {p: (await world.get("/api/" + p)).json() for p in before}
        wrong = (
            await client.post(
                "/tools/resolve_approval?sessionId=other",
                json={"approvalId": plan["approvalId"], "approved": True},
            )
        ).json()
        assert not wrong["ok"]
        await client.post(
            "/tools/resolve_approval", json={"approvalId": plan["approvalId"], "approved": True}
        )
        events += await until(queue, "task.done")
        for e in events:
            parse_event(e)
        kinds = [e["type"] for e in events]
        assert kinds.count("approval.requested") == 1
        assert kinds.count("agent.spawned") == kinds.count("agent.finished") == 4
        assert max(i for i, k in enumerate(kinds) if k == "agent.spawned") < min(
            i for i, k in enumerate(kinds) if k == "agent.finished"
        )
        summary = next(e["payload"] for e in events if e["type"] == "run.summary")
        assert summary["tasks"] == 4 and summary["humanMinutes"] == 14
        for step in plan["steps"]:
            actions = [
                e["payload"]["action"]
                for e in events
                if e["type"] == "agent.action" and e["payload"]["agentId"] == step["agentId"]
            ]
            assert actions[:2] == ["open", "select"]
            assert len(actions) == (3 if step["app"] == "crm" else 4)
        sent = (await world.get("/api/emails?folder=sent")).json()
        assert (
            len(sent) == 1
            and sent[0]["to"] == "thomas.mueller@mueller.test"
            and sent[0]["leadId"] == "L-007"
        )
        added = [e for e in (await world.get("/api/events")).json() if e not in before["events"]]
        assert (
            len(added) == 1 and "T15:00:00" in added[0]["start"] and added[0]["leadId"] == "L-007"
        )
        assert len((await world.get("/api/chat?channel=vertrieb")).json()) == 3
        assert (await world.get("/api/leads/L-007")).json()["status"] == "verhandlung"
        assert not app.state.gateway.tasks.approvals.pending


@pytest.mark.parametrize("approved", [False, None])
async def test_rejection_and_expiry_never_write(scene, approved):
    async with scene() as scene:
        app, client, queue, world = scene
        app.state.gateway.settings = replace(app.state.gateway.settings, approval_timeout=0.03)
        plan, _ = await start(client, queue)
        if approved is not None:
            await client.post(
                "/tools/resolve_approval",
                json={"approvalId": plan["approvalId"], "approved": approved},
            )
        events = await until(queue, "task.failed")
        assert not any(e["type"].startswith("agent.") or e["type"] == "run.summary" for e in events)
        assert (await world.get("/api/emails?folder=sent")).json() == []
        assert not app.state.gateway.tasks.approvals.pending


@pytest.mark.parametrize("mode", ["timeout", "bad_id", "error"])
async def test_planning_fallback(scene, monkeypatch, mode):
    async with scene() as scene:
        from jarvis_orchestrator.runs import ClaudePlanner

        async def plan(*args):
            if mode == "timeout":
                await asyncio.sleep(10)
            if mode == "error":
                raise ValueError("planner unavailable")
            return {
                "title": "Test",
                "steps": [
                    {"tool": "reply_email", "args": {"emailId": "invented", "body": "Hallo"}},
                    {"tool": "post_message", "args": {"channel": "vertrieb", "text": "Hallo"}},
                ],
            }

        monkeypatch.setattr(ClaudePlanner, "plan", plan)
        _, client, queue, _ = scene
        await start(client, queue)


async def test_unknown_request_has_no_mueller_fallback(scene):
    async with scene() as scene:
        _, client, queue, world = scene
        await client.post(
            "/tools/handle_request", json={"instruction": "Kümmer dich um die Brandt AG"}
        )
        events = await until(queue, "task.failed")
        assert not any(e["type"] == "run.planned" for e in events)
        assert (await world.get("/api/leads/L-007")).json()["status"] == "angebot"


async def test_reset_cancels_pending_plan(scene):
    async with scene() as scene:
        app, client, queue, world = scene
        plan, _ = await start(client, queue)
        assert (await client.post("/demo/reset")).json()["ok"]
        assert not app.state.gateway.tasks.approvals.pending
        assert not (
            await client.post(
                "/tools/resolve_approval", json={"approvalId": plan["approvalId"], "approved": True}
            )
        ).json()["ok"]
        assert (await world.get("/api/emails?folder=sent")).json() == []


async def test_valid_model_plan_is_used_and_failures_are_counted_honestly(scene, monkeypatch):
    from jarvis_orchestrator.runs import ClaudePlanner, mueller_plan

    async with scene() as (app, client, queue, world):

        async def plan(self, instruction, context, gateway):
            result = mueller_plan(context)
            result["title"] = "Echter strukturierter Modellplan"
            return result

        monkeypatch.setattr(ClaudePlanner, "plan", plan)
        payload, _ = await start(client, queue)
        assert payload["title"] == "Echter strukturierter Modellplan"
        original = app.state.gateway.request

        async def fail_chat(method, path, **kwargs):
            if method == "POST" and path == "/api/chat":
                raise httpx.ConnectError("offline")
            return await original(method, path, **kwargs)

        monkeypatch.setattr(app.state.gateway, "request", fail_chat)
        await client.post(
            "/tools/resolve_approval", json={"approvalId": payload["approvalId"], "approved": True}
        )
        events = await until(queue, "task.failed")
        finishes = [e["payload"] for e in events if e["type"] == "agent.finished"]
        assert len(finishes) == 4 and sum(e["ok"] for e in finishes) == 3
        summary = next(e["payload"] for e in events if e["type"] == "run.summary")
        assert summary["tasks"] == 3 and summary["humanMinutes"] == 12
        assert not any(
            e["type"] == "agent.action"
            and e["payload"]["app"] == "chat"
            and e["payload"]["action"] == "send"
            for e in events
        )


async def test_repeated_dispatch_returns_same_pending_run(scene):
    async with scene() as (app, client, queue, world):
        plan, _ = await start(client, queue)
        again = (await client.post("/demo/run/mueller")).json()
        assert again["result"]["runId"] == plan["runId"]
        assert len(app.state.gateway.tasks.approvals.pending) == 1


async def test_calendar_conflict_during_approval_prevents_all_writes(scene):
    async with scene() as (app, client, queue, world):
        plan, _ = await start(client, queue)
        await world.post(
            "/api/events",
            json={
                "title": "Kurzfristige Besprechung",
                "start": f"{date(2026, 10, 12)}T15:00:00+02:00",
                "end": f"{date(2026, 10, 12)}T15:30:00+02:00",
            },
        )
        await client.post(
            "/tools/resolve_approval", json={"approvalId": plan["approvalId"], "approved": True}
        )
        events = await until(queue, "task.failed")
        assert not any(e["type"] == "agent.spawned" for e in events)
        assert (await world.get("/api/emails?folder=sent")).json() == []


async def test_reset_during_execution_terminates_every_spawned_agent(scene):
    async with scene() as (app, client, queue, world):
        app.state.gateway.settings = replace(app.state.gateway.settings, run_action_interval=0.05)
        plan, _ = await start(client, queue)
        await client.post(
            "/tools/resolve_approval", json={"approvalId": plan["approvalId"], "approved": True}
        )
        events = await until(queue, "agent.spawned")
        await asyncio.sleep(0.01)
        assert (await client.post("/demo/reset")).json()["ok"]
        while not queue.empty():
            events.append(queue.get_nowait())
        spawned = {e["payload"]["agentId"] for e in events if e["type"] == "agent.spawned"}
        finished = {e["payload"]["agentId"] for e in events if e["type"] == "agent.finished"}
        assert len(spawned) == 4 and spawned == finished
        assert not app.state.gateway.tasks.runs.active
        assert (await world.get("/api/emails?folder=sent")).json() == []


async def test_different_request_while_waiting_is_not_acknowledged_as_old_run(scene):
    async with scene() as (app, client, queue, world):
        await start(client, queue)
        result = (
            await client.post(
                "/tools/handle_request", json={"instruction": "Kümmer dich um die Brandt AG"}
            )
        ).json()
        assert not result["ok"]


async def test_actions_match_t13_frozen_desktop_records(scene):
    async with scene() as (app, client, queue, world):
        before_mail = (await world.get("/api/emails")).json()
        plan, _ = await start(client, queue)
        await client.post(
            "/tools/resolve_approval", json={"approvalId": plan["approvalId"], "approved": True}
        )
        events = await until(queue, "task.done")
        actions = {
            app: [
                e["payload"]
                for e in events
                if e["type"] == "agent.action" and e["payload"]["app"] == app
            ]
            for app in ("mail", "calendar", "chat", "crm")
        }
        mail = actions["mail"]
        assert [a["action"] for a in mail] == ["open", "select", "type", "send"]
        assert mail[1]["entityId"] in {m["id"] for m in before_mail}
        assert mail[2]["field"] == "body"
        assert mail[3]["entityId"] == mail[1]["entityId"]
        calendar = actions["calendar"]
        assert [a["action"] for a in calendar] == ["open", "select", "type", "create"]
        assert calendar[1]["to"] == "2026-10-12T15:00:00+02:00"
        assert calendar[2]["field"] == "title"
        saved_event = next(
            e for e in (await world.get("/api/events")).json() if e["id"] == calendar[3]["entityId"]
        )
        assert (
            saved_event["title"] == calendar[2]["text"]
            and saved_event["start"] == calendar[1]["to"]
        )
        chat = actions["chat"]
        assert [a["action"] for a in chat] == ["open", "select", "type", "send"]
        assert chat[0]["entityId"] == chat[1]["entityId"] == "vertrieb"
        saved_message = next(
            m
            for m in (await world.get("/api/chat?channel=vertrieb")).json()
            if m["id"] == chat[3]["entityId"]
        )
        assert saved_message["text"] == chat[2]["text"]
        crm = actions["crm"]
        assert [a["action"] for a in crm] == ["open", "select", "move"]
        assert crm[1]["entityId"] == crm[2]["entityId"] == "L-007"
        assert (crm[2]["from"], crm[2]["to"]) == ("angebot", "verhandlung")


async def test_failed_crm_write_does_not_animate_successful_move(scene, monkeypatch):
    async with scene() as (app, client, queue, world):
        plan, _ = await start(client, queue)
        original = app.state.gateway.request

        async def fail_crm(method, path, **kwargs):
            if method == "PATCH":
                raise httpx.ConnectError("offline")
            return await original(method, path, **kwargs)

        monkeypatch.setattr(app.state.gateway, "request", fail_crm)
        await client.post(
            "/tools/resolve_approval", json={"approvalId": plan["approvalId"], "approved": True}
        )
        events = await until(queue, "task.failed")
        assert not any(
            e["type"] == "agent.action"
            and e["payload"]["app"] == "crm"
            and e["payload"]["action"] == "move"
            for e in events
        )
        assert (await world.get("/api/leads/L-007")).json()["status"] == "angebot"

async def test_offer_notification_can_plan_one_actual_write(scene, monkeypatch):
    from jarvis_orchestrator.runs import ClaudePlanner

    async def plan(self, instruction, context, gateway):
        return {"title": "Angebot an Vertrieb", "steps": [
            {"tool": "post_message", "args": {"channel": "vertrieb", "text": "Müller GmbH: Angebot über 84.000 Euro."}}
        ]}

    monkeypatch.setattr(ClaudePlanner, "plan", plan)
    async with scene() as (app, client, queue, world):
        await client.post("/tools/handle_request", json={"instruction": "Prüfe das Angebot und informiere den Vertrieb"})
        events = await until(queue, "approval.requested")
        assert len(next(e["payload"]["steps"] for e in events if e["type"] == "run.planned")) == 1
        approval_id = events[-1]["payload"]["approvalId"]
        await client.post("/tools/resolve_approval", json={"approvalId": approval_id, "approved": True})
        events = await until(queue, "task.done")
        assert not any(e["type"] == "task.failed" for e in events)

async def test_mail_list_remains_inbox_after_sending(scene):
    async with scene() as (_, client, queue, world):
        sent = (await world.post("/api/emails/M-001/reply", json={"body":"Vielen Dank"})).json()
        result = (await client.post("/tools/list_emails", json={})).json()
        assert result["ok"]
        assert result["result"]
        assert all(mail["folder"] == "inbox" for mail in result["result"])
        assert sent["id"] not in [mail["id"] for mail in result["result"]]
