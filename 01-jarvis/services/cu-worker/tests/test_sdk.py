import json

import httpx
import pytest
from anthropic import AsyncAnthropic
from test_worker import Desktop

from jarvis_cu_worker.config import Settings
from jarvis_cu_worker.worker import Worker


@pytest.mark.asyncio
async def test_real_sdk_wire_shape_preserves_toolset_name(tmp_path):
    requests = []

    async def handler(req):
        requests.append(json.loads(req.content))
        assert "anthropic-beta" not in req.headers
        content = (
            [{"type": "tool_use", "id": "one", "name": "screenshot", "toolset_name": "computer", "input": {}}]
            if len(requests) == 1
            else [{"type": "text", "text": '{"ok":true,"summary":"Bildschirm geprüft."}'}]
        )
        return httpx.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "model": "claude-haiku-5-5",
                "content": content,
                "stop_reason": "tool_use" if len(requests) == 1 else "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )

    events = []

    async def emit(event):
        events.append(event)

    async with AsyncAnthropic(
        api_key="test-only", http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    ) as sdk:
        worker = Worker(Settings(frame_dir=tmp_path), Desktop(), sdk, emit)
        task = worker.submit("sdk", "s", "Prüfe den Bildschirm", "pixel")
        await task.job
    assert task.status == "done", task.error
    assert requests[1]["messages"][-1]["content"][0]["toolset_name"] == "computer"
    assert requests[0]["tools"] == [{"type": "computer_toolset_20260801"}]
