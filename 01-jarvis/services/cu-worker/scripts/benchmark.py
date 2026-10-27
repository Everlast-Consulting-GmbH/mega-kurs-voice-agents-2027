#!/usr/bin/env python3
"""Run only against the disposable Mock-World: every trial resets all seed data."""

import argparse
import asyncio
import json
import statistics
import time
from pathlib import Path
from uuid import uuid4

import httpx

from jarvis_cu_worker.reference import INSTRUCTION, matching_appointment, reference_date


async def benchmark(worker_url, world_url, modes, runs):
    records = []
    async with httpx.AsyncClient(timeout=5) as client:
        health = await client.get(worker_url + "/health")
        health.raise_for_status()
        if "pixel" in modes and not health.json().get("pixelConfigured"):
            raise RuntimeError("Pixel-Benchmark benötigt einen API-Key im Worker.")
        for mode in modes:
            for trial in range(1, runs + 1):
                reset = await client.post(world_url + "/admin/reset")
                reset.raise_for_status()
                before_response = await client.get(world_url + "/praxis/api/appointments")
                before_response.raise_for_status()
                before = {r["id"] for r in before_response.json()}
                task_id = "bench-" + uuid4().hex
                started = time.monotonic()
                submitted = await client.post(
                    worker_url + "/tasks",
                    json=dict(taskId=task_id, sessionId="benchmark", instruction=INSTRUCTION, mode=mode),
                )
                submitted.raise_for_status()
                state = {}
                try:
                    async with asyncio.timeout(100):
                        while True:
                            response = await client.get(worker_url + "/tasks/" + task_id)
                            response.raise_for_status()
                            state = response.json()
                            if state["status"] != "running":
                                break
                            await asyncio.sleep(0.1)
                except TimeoutError:
                    cancelled = await client.post(worker_url + "/tasks/" + task_id + "/cancel")
                    cancelled.raise_for_status()
                    state = dict(status="timeout", steps=0)
                duration = time.monotonic() - started
                response = await client.get(world_url + "/praxis/api/appointments")
                response.raise_for_status()
                row = matching_appointment(response.json(), reference_date(), before)
                success = state["status"] == "done" and row is not None and row["id"] == "A-101"
                records.append(
                    dict(
                        mode=mode,
                        trial=trial,
                        success=success,
                        durationSeconds=round(duration, 3),
                        steps=state["steps"],
                        status=state["status"],
                        taskId=task_id,
                    )
                )
                print(
                    f"{mode} {trial}/{runs}: {'OK' if success else 'FEHLER'} · {duration:.2f} s", flush=True
                )
    return records


def meets_target(records, mode):
    rows = [r for r in records if r["mode"] == mode]
    threshold = 60 if mode == "pixel" else 20
    return (
        len(rows) >= 10
        and sum(r["success"] for r in rows) / len(rows) >= (0.9 if mode == "pixel" else 1)
        and max(r["durationSeconds"] for r in rows) <= threshold
    )


def summary(records):
    lines = ["| Modus | Erfolg | Median | Maximum | Ziel erreicht |", "|---|---:|---:|---:|---|"]
    for mode in dict.fromkeys(r["mode"] for r in records):
        rows = [r for r in records if r["mode"] == mode]
        durations = [r["durationSeconds"] for r in rows]
        successes = sum(r["success"] for r in rows)
        target = meets_target(records, mode)
        lines.append(
            f"| {mode} | {successes}/{len(rows)} | {statistics.median(durations):.2f} s | {max(durations):.2f} s | {'ja' if target else 'nein'} |"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", default="http://localhost:8800")
    parser.add_argument("--world", default="http://localhost:8700")
    parser.add_argument("--modes", nargs="+", choices=["pixel", "assisted"], default=["pixel", "assisted"])
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--output", type=Path, default=Path("services/cu-worker/artifacts/benchmark.json"))
    args = parser.parse_args()
    if not 1 <= args.runs <= 100:
        parser.error("--runs muss zwischen 1 und 100 liegen")
    records = asyncio.run(benchmark(args.worker.rstrip("/"), args.world.rstrip("/"), args.modes, args.runs))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, indent=2))
    print(summary(records))
    raise SystemExit(0 if all(meets_target(records, mode) for mode in args.modes) else 1)
