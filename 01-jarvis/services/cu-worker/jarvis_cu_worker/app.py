from contextlib import asynccontextmanager
from typing import Literal

from anthropic import AsyncAnthropic
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .config import Settings
from .desktop import Desktop
from .events import EventOutbox
from .worker import BusyError, Worker


class TaskInput(BaseModel):
    taskId: str = Field(pattern=r"^[A-Za-z0-9_-]{1,100}$")
    sessionId: str = Field(min_length=1, max_length=200)
    instruction: str = Field(min_length=1, max_length=10000)
    mode: Literal["pixel", "assisted"] = "pixel"


def make_client(settings):
    if not settings.api_key:
        return None
    return AsyncAnthropic(api_key=settings.api_key, base_url=settings.base_url, max_retries=1, timeout=25)


def create_app(worker=None):
    @asynccontextmanager
    async def lifespan(app):
        if worker is not None:
            app.state.worker = worker
            yield
            await worker.close()
            return
        settings = Settings.from_env()
        outbox = EventOutbox(settings.frame_dir.parent / "outbox", settings.orchestrator_url)
        client = make_client(settings)
        app.state.worker = Worker(settings, Desktop(), client, outbox.emit)
        app.state.outbox = outbox
        outbox.start()
        try:
            yield
        finally:
            await app.state.worker.close()
            await outbox.close()
            if client:
                await client.close()

    app = FastAPI(title="Jarvis Computer Use", lifespan=lifespan)
    if worker is not None:
        app.state.worker = worker

    @app.get("/health")
    async def health():
        outbox = getattr(app.state, "outbox", None)
        return {
            "ok": True,
            "pixelConfigured": app.state.worker.client is not None,
            "pendingEvents": len(outbox.pending()) if outbox else 0,
            "eventDeliveryDegraded": outbox.last_error if outbox else False,
        }

    @app.post("/tasks", status_code=202)
    async def submit(body: TaskInput):
        try:
            task = app.state.worker.submit(body.taskId, body.sessionId, body.instruction, body.mode)
            return {"taskId": task.task_id, **task.view()}
        except BusyError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/tasks/{task_id}")
    async def get_task(task_id: str):
        task = app.state.worker.tasks.get(task_id)
        if task is None:
            raise HTTPException(404, "Aufgabe nicht gefunden")
        return task.view()

    @app.post("/tasks/{task_id}/cancel")
    async def cancel(task_id: str):
        if task_id not in app.state.worker.tasks:
            raise HTTPException(404, "Aufgabe nicht gefunden")
        return (await app.state.worker.cancel(task_id)).view()

    @app.get("/frames/{task_id}/{n}.png")
    async def frame(task_id: str, n: int):
        try:
            path = app.state.worker.frame_path(task_id, n)
        except ValueError:
            raise HTTPException(404, "Frame nicht gefunden")
        if not path.is_file():
            raise HTTPException(404, "Frame nicht gefunden")
        return FileResponse(
            path, media_type="image/png", headers={"Cache-Control": "public, max-age=3600, immutable"}
        )

    return app


app = create_app()
