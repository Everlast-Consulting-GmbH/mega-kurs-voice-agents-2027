import asyncio
from contextlib import contextmanager

from jarvis_contracts import make_event, parse_event


class EventHub:
    """One-process fanout; slow clients are disconnected instead of blocking tools."""

    def __init__(self, capacity: int = 512):
        self.capacity = capacity
        self.subscribers: dict[asyncio.Queue, str] = {}

    @contextmanager
    def subscribe(self, session_id: str):
        queue = asyncio.Queue(self.capacity)
        self.subscribers[queue] = session_id
        try:
            yield queue
        finally:
            self.subscribers.pop(queue, None)

    def publish(self, raw: dict):
        event = parse_event(raw).model_dump(mode="json", by_alias=True, exclude_unset=True, exclude_none=True)
        for queue, session_id in tuple(self.subscribers.items()):
            if session_id != event["sessionId"]:
                continue
            if queue.full():
                self.subscribers.pop(queue, None)
                while not queue.empty():
                    queue.get_nowait()
                queue.put_nowait(None)
            else:
                queue.put_nowait(event)
        return event

    def emit(self, event_type: str, payload: dict, session_id: str = "demo"):
        return self.publish(make_event(event_type, payload, session_id))
