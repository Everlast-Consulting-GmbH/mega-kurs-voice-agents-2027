import json
import os
from contextlib import asynccontextmanager

import anyio
import httpx
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from jarvis_contracts import parse_event
from jsonschema import ValidationError as SchemaError
from pydantic import ValidationError
from starlette.routing import Route

from .agent import ClaudeAgent
from .config import Settings
from .contracts import PORTS, catalog, validate_input
from .events import EventHub
from .gateway import Gateway
from .mcp import McpEndpoint
from .tasks import Tasks


def create_app(settings=None, agent=None):
    settings = settings or Settings.from_env()
    hub = EventHub(settings.subscriber_capacity)
    http = httpx.AsyncClient(timeout=settings.http_timeout, trust_env=False)
    gateway = Gateway(settings, hub, http)
    gateway.tasks = Tasks(gateway, agent or ClaudeAgent())
    mcp = McpEndpoint(gateway)

    @asynccontextmanager
    async def lifespan(app):
        async with http, mcp.manager.run():
            try:
                yield
            finally:
                await gateway.close()

    app = FastAPI(title="Jarvis Orchestrator", lifespan=lifespan)
    app.state.gateway = gateway
    app.state.hub = hub
    app.add_middleware(
        CORSMiddleware,
        # Any local port, so a second HUD (e.g. a worktree next to the main checkout) works too.
        allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/tools")
    async def tools():
        return catalog()

    @app.post("/tools/{name}")
    async def call_tool(name: str, body: dict, sessionId: str = Query("demo", min_length=1)):
        try:
            validate_input(name, body)
        except KeyError:
            raise HTTPException(404, "Unbekanntes Tool") from None
        except SchemaError:
            raise HTTPException(422, "Ungültige Tool-Argumente") from None
        return await gateway.call(name, body, sessionId)

    @app.post("/demo/reset")
    async def demo_reset():
        if gateway.resetting:
            raise HTTPException(409, "Reset läuft bereits")
        gateway.resetting = True
        try:
            await gateway.close()
            return await gateway.request("POST", "/admin/reset")
        finally:
            gateway.resetting = False

    @app.post("/demo/run/mueller")
    async def demo_mueller(sessionId: str = Query("demo", min_length=1)):
        return await gateway.call("handle_request", {"instruction": "Kümmer dich um die Müller GmbH"}, sessionId)

    @app.post("/demo/notice/{kind}")
    async def demo_notice(kind: str, sessionId: str = Query("demo", min_length=1)):
        try:
            return await gateway.notice(kind, sessionId)
        except KeyError:
            raise HTTPException(404, "Unbekannter Hinweis") from None
        except (httpx.HTTPError, ValidationError):
            raise HTTPException(502, "Mock-World nicht erreichbar oder fehlerhaft") from None

    def ingest(raw):
        event = parse_event(raw).model_dump(mode="json", by_alias=True, exclude_unset=True, exclude_none=True)
        if gateway.tasks.ingest(event):
            hub.publish(event)

    @app.post("/events", status_code=202)
    async def post_event(body: dict):
        try:
            ingest(body)
        except (ValidationError, ValueError):
            raise HTTPException(422, "Ungültiges Event oder unbekannte Freigabe") from None
        return {"ok": True}

    @app.websocket("/events")
    async def events(ws: WebSocket, sessionId: str = Query("demo", min_length=1)):
        with hub.subscribe(sessionId) as queue:
            await ws.accept()

            async def send():
                while True:
                    event = await queue.get()
                    if event is None:
                        await ws.close(code=1013, reason="Bitte erneut verbinden")
                        return
                    await ws.send_json(event)

            async def receive():
                while True:
                    try:
                        raw = await ws.receive_json()
                        event = parse_event(raw)
                        if event.type == "approval.resolved" and event.sessionId == sessionId:
                            ingest(raw)
                    except (ValidationError, ValueError, json.JSONDecodeError):
                        continue

            async with anyio.create_task_group() as group:

                async def run_job(job):
                    try:
                        await job()
                    except WebSocketDisconnect:
                        pass
                    finally:
                        group.cancel_scope.cancel()

                group.start_soon(run_job, send)
                group.start_soon(run_job, receive)

    app.router.routes.append(Route("/mcp", endpoint=mcp, methods=["GET", "POST", "DELETE"]))
    return app


def main():
    import uvicorn

    uvicorn.run(create_app(), host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", PORTS["orchestrator"])))


if __name__ == "__main__":
    main()
