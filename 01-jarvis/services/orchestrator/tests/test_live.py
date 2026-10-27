"""Only contacts Anthropic when a real key AND the real mock-world are available."""

import asyncio

import httpx
import pytest
from jarvis_orchestrator.app import create_app
from jarvis_orchestrator.config import Settings

settings = Settings.from_env()


@pytest.mark.live
@pytest.mark.skipif(not settings.api_key, reason="ANTHROPIC_API_KEY fehlt")
async def test_live_delegate_three_leads():
    async with httpx.AsyncClient(timeout=2, trust_env=False) as http:
        try:
            response = await http.get(settings.mock_world_url + "/api/leads", params={"limit": 3})
            response.raise_for_status()
        except httpx.HTTPError:
            pytest.skip("Mock-World läuft nicht")
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        with app.state.hub.subscribe("live-smoke") as queue:
            result = await app.state.gateway.call(
                "delegate_task",
                {"instruction": "Fasse die drei wichtigsten Leads zusammen"},
                "live-smoke",
            )
            async with asyncio.timeout(settings.task_timeout + 5):
                while True:
                    event = await queue.get()
                    if (
                        event["type"] in ("task.done", "task.failed")
                        and event["payload"]["taskId"] == result["result"]["taskId"]
                    ):
                        assert event["type"] == "task.done", event["payload"].get("error")
                        assert event["payload"]["result"].strip()
                        break
