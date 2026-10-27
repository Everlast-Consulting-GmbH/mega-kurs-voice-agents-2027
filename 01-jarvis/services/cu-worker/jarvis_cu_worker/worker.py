import asyncio
import re
import time
from dataclasses import dataclass

from jarvis_contracts import make_event

from .actions import action_payload
from .pixel import run_pixel
from .reference import appointments, is_reference_instruction, matching_appointment, reference_date


@dataclass
class Task:
    task_id: str
    session_id: str
    instruction: str
    mode: str
    status: str = "running"
    steps: int = 0
    frames: int = 0
    started: float = 0
    duration_ms: int = 0
    error: str | None = None
    job: asyncio.Task | None = None
    terminal: bool = False
    cancel_requested: bool = False
    cleaning_up: bool = False

    def view(self):
        return {
            "status": self.status,
            "steps": self.steps,
            "durationMs": int((time.monotonic() - self.started) * 1000)
            if self.status == "running"
            else self.duration_ms,
            **({"error": self.error} if self.error else {}),
        }


class BusyError(ValueError):
    pass


class Worker:
    def __init__(self, settings, desktop, client, emit):
        self.settings, self.desktop, self.client, self.emit = settings, desktop, client, emit
        self.tasks = {}
        self.settings.frame_dir.mkdir(parents=True, exist_ok=True)

    def submit(self, task_id, session_id, instruction, mode):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", task_id):
            raise ValueError("Ungültige Task-ID")
        if task_id in self.tasks:
            task = self.tasks[task_id]
            if (task.session_id, task.instruction, task.mode) != (session_id, instruction, mode):
                raise BusyError("Task-ID ist bereits anders belegt")
            return task
        if any(t.job and not t.job.done() for t in self.tasks.values()):
            raise BusyError("Der Desktop ist belegt. Laufende Aufgabe zuerst abbrechen.")
        # Do not overwrite frames retained from an earlier worker process.
        folder = self.settings.frame_dir / task_id
        if folder.exists():
            raise BusyError("Task-ID existiert bereits; bitte eine neue ID verwenden.")
        folder.mkdir()
        task = Task(task_id, session_id, instruction, mode, started=time.monotonic())
        self.tasks[task_id] = task
        task.job = asyncio.create_task(self.run(task))
        return task

    async def event(self, task, kind, **payload):
        await self.emit(make_event(kind, {"taskId": task.task_id, **payload}, task.session_id))

    def frame_path(self, task_id, n):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", task_id) or n < 0:
            raise ValueError("Ungültiger Frame-Pfad")
        return self.settings.frame_dir / task_id / f"{n}.png"

    async def frame(self, task, data=None):
        data = data if data is not None else await self.desktop.screenshot()
        path = self.frame_path(task.task_id, task.frames)
        temp = path.with_suffix(".tmp")
        temp.write_bytes(data)
        temp.replace(path)
        task.frames += 1
        await self.event(
            task,
            "cu.frame",
            imageUrl=f"{self.settings.public_url.rstrip('/')}/frames/{task.task_id}/{path.name}",
            width=1280,
            height=800,
        )
        return data

    async def step(self, task, name, args, *, operation=None, target=None, caption=None, total=None):
        if task.steps >= self.settings.max_steps:
            raise RuntimeError("Aktionslimit erreicht")
        cursor = await self.desktop.position()
        payload = action_payload(
            task.task_id, name, args, task.steps + 1, cursor, target=target, caption=caption, total=total
        )
        task.steps += 1
        await self.emit(make_event("cu.action", payload, task.session_id))
        data = await operation() if operation else await self.desktop.execute(name, args)
        # Zoom images go to the model; HUD always receives the full display.
        frame = await self.frame(task, data if name == "screenshot" and isinstance(data, bytes) else None)
        await self.event(
            task,
            "task.progress",
            message=payload["caption"],
            step=task.steps,
            **({"totalSteps": total} if total else {}),
        )
        return frame if name == "screenshot" else data

    async def finish(self, task, status, result):
        if task.terminal:
            return
        task.terminal = True
        task.status = status
        task.duration_ms = int((time.monotonic() - task.started) * 1000)
        if status == "done":
            await self.event(task, "task.done", result=result)
        else:
            task.error = result
            await self.event(task, "task.failed", error=result)

    async def run(self, task):
        status, result = "failed", "Die Computer-Aufgabe ist fehlgeschlagen."
        try:
            async with asyncio.timeout(self.settings.timeout_seconds):
                await self.event(task, "cu.mode", mode=task.mode, vncUrl=self.settings.vnc_url)
                reference = is_reference_instruction(task.instruction)
                day = reference_date()
                before = (
                    {r["id"] for r in await appointments(self.settings.praxis_url)} if reference else set()
                )
                if task.mode == "pixel":
                    result = await run_pixel(self, task)
                else:
                    from .assisted import run_assisted

                    result = await run_assisted(self, task)
                if reference:
                    row = None
                    for _ in range(10):
                        row = matching_appointment(await appointments(self.settings.praxis_url), day, before)
                        if row:
                            break
                        await asyncio.sleep(0.1)
                    if row is None:
                        raise RuntimeError("Termin konnte in der Praxis-App nicht bestätigt werden.")
                    result = f"Termin {row['id']} für Dr. Anna Weber am {day:%d.%m.%Y} um 10:00 bestätigt: Erstgespräch."
                status = "done"
        except TimeoutError:
            result = "Zeitlimit erreicht (90 Sekunden). Bitte im Assisted-Modus erneut starten."
        except asyncio.CancelledError:
            status, result = "cancelled", "Computer-Aufgabe abgebrochen."
        except Exception as exc:
            # Only controlled failures are suitable for the HUD; SDK exceptions may contain credentials.
            result = (
                str(exc)
                if type(exc) is RuntimeError
                else f"Computer-Aufgabe fehlgeschlagen ({type(exc).__name__})."
            )
        finally:
            task.cleaning_up = True
            try:
                async with asyncio.timeout(2):
                    await self.desktop.release()
            except Exception:
                status, result = (
                    "failed",
                    "Desktop konnte nicht freigegeben werden. Container bitte neu starten.",
                )
            await self.finish(task, status, result)

    async def cancel(self, task_id):
        task = self.tasks[task_id]
        if task.job and not task.job.done():
            if not task.cancel_requested and not task.cleaning_up:
                task.cancel_requested = True
                task.job.cancel()
            try:
                await asyncio.shield(task.job)
            except asyncio.CancelledError:
                # A task cancelled before its coroutine started has no finally block.
                if task.job.cancelled():
                    await self.finish(task, "cancelled", "Computer-Aufgabe abgebrochen.")
                else:
                    raise
        return task

    async def close(self):
        for task_id in list(self.tasks):
            await self.cancel(task_id)
