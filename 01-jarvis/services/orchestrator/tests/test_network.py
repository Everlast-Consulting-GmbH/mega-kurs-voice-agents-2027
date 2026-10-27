"""Smoke the real TCP/WS transport and the official MCP client without API keys."""

import asyncio
import json
import socket
from contextlib import asynccontextmanager
from time import perf_counter

import httpx
import respx
import uvicorn
import websockets
from jarvis_contracts import make_event, parse_event
from jarvis_orchestrator.app import create_app
from jarvis_orchestrator.config import Settings
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from test_gateway import LEAD


@asynccontextmanager
async def serve(app):
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", ws="websockets-sansio"))
    task = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        async with asyncio.timeout(5):
            while not server.started:
                if task.done():
                    await task
                await asyncio.sleep(0.01)
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, 5)
        sock.close()


@respx.mock
async def test_network_smoke():
    respx.route(host="127.0.0.1").pass_through()
    respx.get("http://localhost:8700/api/leads", params={"limit": 3}).respond(json=[LEAD])
    app = create_app(Settings())
    async with serve(app) as url, httpx.AsyncClient(base_url=url) as http:
        assert (await http.get("/health")).json() == {"ok": True}
        catalog = (await http.get("/tools")).json()
        assert len(catalog) == 18
        async with websockets.connect(
            url.replace("http:", "ws:") + "/events?sessionId=smoke"
        ) as ws:
            event = make_event("voice.state", {"state": "listening"}, "smoke")
            assert (await http.post("/events", json=event)).status_code == 202
            received = json.loads(await asyncio.wait_for(ws.recv(), 2))
            parse_event(received)
            assert received == event
            start = perf_counter()
            response = await http.post("/tools/list_leads?sessionId=smoke", json={"limit": 3})
            latency_ms = (perf_counter() - start) * 1000
            assert response.json()["result"][0]["id"] == "L-007"
            assert latency_ms < 300
            assert json.loads(await asyncio.wait_for(ws.recv(), 2))["type"] == "tool.started"
            assert json.loads(await asyncio.wait_for(ws.recv(), 2))["type"] == "tool.finished"
            async with streamable_http_client(url + "/mcp?sessionId=smoke") as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    listed = await session.list_tools()
                    assert {t.name for t in listed.tools} == {t["name"] for t in catalog}
                    result = await session.call_tool(
                        "focus_entity",
                        {"entity": "lead", "entityId": "L-007", "label": "Müller GmbH"},
                    )
                    assert not result.isError
                    assert json.loads(result.content[0].text)["ok"]
            for kind in ("tool.started", "ui.focus", "tool.finished"):
                assert json.loads(await asyncio.wait_for(ws.recv(), 2))["type"] == kind
            print(
                f"\nTCP smoke: health, 14 tools, HTTP→WS, MCP list/call OK; mocked list_leads {latency_ms:.1f} ms"
            )
