"""Run inside the actual container with the local fixture on port 8701."""

import os
from pathlib import Path

import httpx
import pytest
from jarvis_contracts import parse_event
from test_worker import Client, call, done, response

from jarvis_cu_worker.config import Settings
from jarvis_cu_worker.desktop import Desktop
from jarvis_cu_worker.reference import INSTRUCTION
from jarvis_cu_worker.worker import Worker

pytestmark = [
    pytest.mark.desktop,
    pytest.mark.skipif(os.getenv("CU_DESKTOP_TEST") != "1", reason="Linux desktop required"),
]


@pytest.mark.asyncio
async def test_assisted_real_desktop_and_verified_appointment(tmp_path):
    async with httpx.AsyncClient() as client:
        await client.post("http://127.0.0.1:8701/admin/reset")
    events = []

    async def emit(event):
        parse_event(event)
        events.append(event)

    worker = Worker(
        Settings(frame_dir=tmp_path, praxis_url="http://127.0.0.1:8701/praxis"), Desktop(), None, emit
    )
    task = worker.submit("smoke-assisted", "smoke", INSTRUCTION, "assisted")
    await task.job
    assert task.status == "done", task.error
    assert task.steps == 8
    assert len([e for e in events if e["type"] == "cu.action" and e["payload"].get("target")]) == 8
    assert "A-101" in events[-1]["payload"]["result"]
    Path("/tmp/cu-smoke-assisted.png").write_bytes(
        worker.frame_path(task.task_id, task.frames - 1).read_bytes()
    )


@pytest.mark.asyncio
async def test_pixel_real_x11_with_mocked_anthropic(tmp_path):
    desktop = Desktop()
    model = Client(
        [
            response(call("left_click", {"coordinate": [130, 129]}), call("screenshot", id="s1")),
            response(
                call("left_click", {"coordinate": [180, 228]}, id="c2"),
                call("type", {"text": "Anna Weber"}, id="t2"),
                call("screenshot", id="s2"),
            ),
            done(),
        ]
    )
    events = []

    async def emit(event):
        parse_event(event)
        events.append(event)

    worker = Worker(
        Settings(frame_dir=tmp_path, praxis_url="http://127.0.0.1:8701/praxis"), desktop, model, emit
    )
    task = worker.submit("smoke-pixel", "smoke", "Suche Anna Weber in der Patientenübersicht", "pixel")
    await task.job
    assert task.status == "done", task.error
    assert task.steps == 5
    # Use CDP only as a test oracle, never for pixel-mode execution.
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp("http://127.0.0.1:9222")
        assert (
            await browser.contexts[0].pages[0].get_by_label("Patienten suchen").input_value() == "Anna Weber"
        )
        assert (
            await browser.contexts[0]
            .pages[0]
            .get_by_role("button", name="Dr. Anna Weber · P-001")
            .is_visible()
        )
    Path("/tmp/cu-smoke-pixel.png").write_bytes(worker.frame_path(task.task_id, task.frames - 1).read_bytes())
