"""Explicit opt-in; a missing API key always skips real model calls."""

import os
from uuid import uuid4

import httpx
import pytest
from anthropic import AsyncAnthropic

from jarvis_cu_worker.config import Settings
from jarvis_cu_worker.desktop import Desktop
from jarvis_cu_worker.reference import INSTRUCTION, appointments, matching_appointment, reference_date
from jarvis_cu_worker.worker import Worker

settings = Settings.from_env()


@pytest.mark.live
@pytest.mark.asyncio
@pytest.mark.skipif(
    not settings.api_key or os.getenv("CU_LIVE_TEST") != "1",
    reason="Live-Lauf benötigt API-Key und CU_LIVE_TEST=1 im Desktop-Container",
)
async def test_live_reference(tmp_path):
    settings.frame_dir = tmp_path
    async with httpx.AsyncClient(timeout=5) as client:
        response = await client.post(settings.praxis_url.removesuffix("/praxis") + "/admin/reset")
        response.raise_for_status()
    events = []

    async def emit(event):
        events.append(event)

    async with AsyncAnthropic(api_key=settings.api_key, max_retries=1, timeout=25) as sdk:
        worker = Worker(settings, Desktop(), sdk, emit)
        task = worker.submit("live-" + uuid4().hex, "live-test", INSTRUCTION, "pixel")
        await task.job
    assert task.status == "done", task.error
    row = matching_appointment(await appointments(settings.praxis_url), reference_date(), set())
    assert row is not None and row["id"] == "A-101"
    assert any(e["type"] == "cu.frame" for e in events)
