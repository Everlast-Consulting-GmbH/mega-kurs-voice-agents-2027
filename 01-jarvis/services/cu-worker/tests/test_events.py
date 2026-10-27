import asyncio
import json

import httpx
import pytest
from jarvis_contracts import make_event

from jarvis_cu_worker.events import EventOutbox


@pytest.mark.asyncio
async def test_outbox_retries_in_order_and_replays_after_restart(tmp_path, monkeypatch):
    calls = []
    fail = True

    async def handler(request):
        event = json.loads(request.content)
        calls.append(event["id"])
        return httpx.Response(503 if fail else 200, json={"ok": not fail})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        "jarvis_cu_worker.events.httpx.AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    outbox = EventOutbox(tmp_path, "http://orchestrator")
    first = make_event("cu.mode", {"taskId": "t", "mode": "pixel"})
    last = make_event("task.failed", {"taskId": "t", "error": "Abgebrochen."})
    await outbox.emit(first)
    await outbox.emit(last)
    outbox.start()
    await asyncio.sleep(0.02)
    assert outbox.last_error and len(outbox.pending()) == 2
    await outbox.close()
    fail = False
    replay = EventOutbox(tmp_path, "http://orchestrator")
    replay.start()
    async with asyncio.timeout(1):
        while replay.pending():
            await asyncio.sleep(0.01)
    await replay.close()
    assert calls == [first["id"], first["id"], last["id"]]
