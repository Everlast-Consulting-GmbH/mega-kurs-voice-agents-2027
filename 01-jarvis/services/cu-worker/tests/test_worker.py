import asyncio
import copy
from io import BytesIO
from types import SimpleNamespace

import httpx
import pytest
from jarvis_contracts import parse_event
from PIL import Image

from jarvis_cu_worker.actions import action_payload
from jarvis_cu_worker.app import create_app
from jarvis_cu_worker.config import Settings
from jarvis_cu_worker.worker import Worker


def png():
    out = BytesIO()
    Image.new("RGB", (1280, 800), "navy").save(out, "PNG")
    return out.getvalue()


class Desktop:
    def __init__(self):
        self.actions = []
        self.released = 0

    async def prepare(self, url, cdp_url):
        pass

    async def screenshot(self):
        return png()

    async def position(self):
        return (400, 300)

    async def execute(self, name, args):
        self.actions.append((name, args))
        if name == "wait":
            await asyncio.sleep(args["duration"])
        if name == "bad":
            raise ValueError("Invalid action")
        return "OK"

    async def release(self):
        self.released += 1


class Client:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []
        self.messages = self

    async def create(self, **kwargs):
        self.requests.append(copy.deepcopy(kwargs))
        response = next(self.responses)
        if isinstance(response, float):
            await asyncio.sleep(response)
        return response


def response(*blocks, stop="tool_use"):
    return SimpleNamespace(content=list(blocks), stop_reason=stop)


def call(name, args=None, id="tool-1", toolset="computer"):
    return {"type": "tool_use", "id": id, "name": name, "toolset_name": toolset, "input": args or {}}


def done():
    return response({"type": "text", "text": '{"ok":true,"summary":"Fertig."}'}, stop="end_turn")


@pytest.fixture
def setup(tmp_path):
    events = []

    async def emit(event):
        parse_event(event)
        events.append(event)

    settings = Settings(frame_dir=tmp_path, timeout_seconds=0.15)
    desktop = Desktop()

    def build(responses):
        client = Client(responses)
        worker = Worker(settings, desktop, client, emit)
        return worker, client, events, desktop

    return build


@pytest.mark.parametrize(
    "name,args,kind,caption",
    [
        ("left_click", {"coordinate": [10, 20]}, "click", "Klicke"),
        ("right_click", {}, "click", "Rechtsklick"),
        ("double_click", {}, "double_click", "Doppelklick"),
        ("type", {"text": "Müller"}, "type", "Schreibe"),
        ("key", {"text": "Return"}, "key", "Drücke"),
        ("scroll", {"scroll_direction": "down", "scroll_amount": 2}, "scroll", "Scrolle nach unten"),
        ("zoom", {"region": [0, 0, 50, 50]}, "screenshot", "Vergrößere"),
        ("left_click_drag", {"start_coordinate": [1, 2], "coordinate": [3, 4]}, "drag", "Ziehe"),
    ],
)
def test_action_contract(name, args, kind, caption):
    p = action_payload("t", name, args, 1, (400, 300))
    assert p["action"] == kind and p["caption"].startswith(caption)
    assert p["target"]["x"] >= 0 and p["target"]["y"] >= 0
    assert p["step"] == 1


@pytest.mark.asyncio
async def test_batch_events_frames_and_api_contract(setup):
    worker, client, events, desktop = setup(
        [
            response(
                call("left_click", {"coordinate": [100, 200]}),
                call("type", {"text": "Dr. Anna Weber"}, id="tool-2"),
                call("screenshot", id="tool-3"),
            ),
            done(),
        ]
    )
    worker.submit("t", "session", "Teste die Eingabe", "pixel")
    await worker.tasks["t"].job
    assert worker.tasks["t"].status == "done"
    assert worker.tasks["t"].steps == 3
    assert [e["type"] for e in events].count("cu.action") == 3
    assert [e["type"] for e in events].count("cu.frame") == 4
    assert events[-1]["type"] == "task.done"
    assert all(e["sessionId"] == "session" for e in events)
    assert worker.frame_path("t", 3).read_bytes().startswith(b"\x89PNG")
    req = client.requests[0]
    assert req["model"] == "claude-haiku-5-5"
    assert req["tools"] == [{"type": "computer_toolset_20260801"}]
    assert "betas" not in req
    results = client.requests[1]["messages"][-1]["content"]
    assert len(results) == 3
    assert all(r["toolset_name"] == "computer" for r in results)
    assert results[-1]["content"][0]["type"] == "image"
    assert desktop.released == 1


@pytest.mark.asyncio
async def test_batch_stops_on_failure_and_answers_every_call(setup):
    worker, client, events, desktop = setup(
        [response(call("bad"), call("type", {"text": "must not type"}, id="2")), done()]
    )
    worker.submit("t", "s", "Test", "pixel")
    await worker.tasks["t"].job
    assert not any(n == "type" for n, _ in desktop.actions)
    results = client.requests[1]["messages"][-1]["content"]
    assert len(results) == 2 and all(r["is_error"] for r in results)
    assert results[1]["content"] == "Not executed: an earlier computer action in this turn failed."


@pytest.mark.asyncio
async def test_timeout_releases_desktop_and_emits_one_terminal_event(setup):
    worker, _, events, desktop = setup([1.0])
    worker.submit("t", "s", "Test", "pixel")
    await worker.tasks["t"].job
    assert worker.tasks["t"].status == "failed"
    assert "Zeitlimit" in events[-1]["payload"]["error"]
    assert len([e for e in events if e["type"] == "task.failed"]) == 1
    assert desktop.released == 1


@pytest.mark.asyncio
async def test_cancel_releases_desktop_and_can_start_again(setup):
    worker, _, events, desktop = setup([1.0, done()])
    worker.submit("t", "s", "Test", "pixel")
    await asyncio.sleep(0.02)
    await worker.cancel("t")
    assert worker.tasks["t"].status == "cancelled"
    assert events[-1]["type"] == "task.failed"
    worker.submit("u", "s", "Test", "pixel")
    await worker.tasks["u"].job
    assert worker.tasks["u"].status == "done"


@pytest.mark.asyncio
async def test_http_acceptance_busy_idempotency_frames_and_cancel(setup):
    worker, _, _, _ = setup([1.0])
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=create_app(worker)), base_url="http://test"
    ) as api:
        body = dict(taskId="task-1", sessionId="demo", instruction="Test", mode="pixel")
        assert (await api.post("/tasks", json=body)).status_code == 202
        assert (await api.post("/tasks", json=body)).status_code == 202
        assert (await api.post("/tasks", json={**body, "instruction": "different"})).status_code == 409
        assert (await api.post("/tasks", json={**body, "taskId": "task-2"})).status_code == 409
        assert (await api.post("/tasks", json={**body, "taskId": "../escape"})).status_code == 422
        await asyncio.sleep(0.02)
        assert (await api.get("/frames/task-1/0.png")).headers["content-type"] == "image/png"
        assert (await api.get("/frames/task-1/999.png")).status_code == 404
        assert (await api.post("/tasks/task-1/cancel")).status_code == 200
        state = (await api.get("/tasks/task-1")).json()
        assert state["status"] == "cancelled" and state["durationMs"] >= 0
        assert (await api.get("/tasks/missing")).status_code == 404


@pytest.mark.asyncio
async def test_immediate_cancel_before_job_starts(setup):
    worker, _, events, _ = setup([done()])
    worker.submit("t", "s", "Test", "pixel")
    await worker.cancel("t")
    assert worker.tasks["t"].status == "cancelled"
    assert events[-1]["type"] == "task.failed"


@pytest.mark.asyncio
async def test_max_tokens_is_not_success(setup):
    worker, _, events, _ = setup([response({"type": "text", "text": "..."}, stop="max_tokens")])
    worker.submit("t", "s", "Test", "pixel")
    await worker.tasks["t"].job
    assert events[-1]["type"] == "task.failed"


@pytest.mark.asyncio
async def test_repeated_cancel_does_not_interrupt_cleanup(setup):
    worker, _, _, desktop = setup([1.0])
    started, released = asyncio.Event(), asyncio.Event()

    async def release():
        started.set()
        await asyncio.sleep(0.03)
        released.set()

    desktop.release = release
    worker.submit("t", "s", "Test", "pixel")
    await asyncio.sleep(0.01)
    first = asyncio.create_task(worker.cancel("t"))
    await started.wait()
    await worker.cancel("t")
    await first
    assert released.is_set()


@pytest.mark.asyncio
async def test_model_failure_is_not_task_done(setup):
    worker, _, events, _ = setup(
        [response({"type": "text", "text": "Ich konnte den Termin nicht speichern."}, stop="end_turn")]
    )
    task = worker.submit("t", "s", "Speichere einen Termin", "pixel")
    await task.job
    assert task.status == "failed"
    assert events[-1]["type"] == "task.failed"


@pytest.mark.asyncio
async def test_pixel_prepares_configured_page_before_first_frame(setup):
    worker, _, _, desktop = setup([done()])
    calls = []

    async def prepare(url, cdp):
        calls.append((url, cdp))

    desktop.prepare = prepare
    task = worker.submit("t", "s", "Prüfe die App", "pixel")
    await task.job
    assert calls == [(worker.settings.praxis_url, worker.settings.cdp_url)]
