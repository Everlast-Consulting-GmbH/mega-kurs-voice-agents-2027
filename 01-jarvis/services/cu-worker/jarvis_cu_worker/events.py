"""Ordered disk-backed outbox: HUD delivery never blocks desktop actions."""

import asyncio
import json
import time
from uuid import uuid4

import httpx
from jarvis_contracts import parse_event


class EventOutbox:
    def __init__(self, root, url):
        self.root, self.url = root, url.rstrip("/") + "/events"
        root.mkdir(parents=True, exist_ok=True)
        self.wake = asyncio.Event()
        self.job = None
        self.last_error = False

    async def emit(self, event):
        parse_event(event)
        path = self.root / f"{time.time_ns():020}-{uuid4().hex}.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(event, ensure_ascii=False))
        tmp.replace(path)
        self.wake.set()

    def pending(self):
        return sorted(self.root.glob("*.json"))

    async def run(self):
        async with httpx.AsyncClient(timeout=1) as client:
            delay = 0.1
            while True:
                self.wake.clear()
                pending = self.pending()
                if not pending:
                    await self.wake.wait()
                    continue
                path = pending[0]
                try:
                    response = await client.post(self.url, json=json.loads(path.read_text()))
                    response.raise_for_status()
                    path.unlink()
                    self.last_error, delay = False, 0.1
                except httpx.HTTPError:
                    self.last_error = True
                    await asyncio.sleep(delay)
                    delay = min(5, delay * 2)

    def start(self):
        self.job = asyncio.create_task(self.run())

    async def close(self):
        if self.job:
            self.job.cancel()
            try:
                await self.job
            except asyncio.CancelledError:
                pass
