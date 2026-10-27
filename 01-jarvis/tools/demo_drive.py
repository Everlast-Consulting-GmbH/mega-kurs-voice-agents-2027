"""Drives the demo flow through the real tool gateway, without voice.

Calls exactly the tools Jarvis would call by voice, so the HUD, orchestrator,
mock-world and cu-worker can be rehearsed end-to-end without ElevenLabs or LLM keys.

    uv run python tools/demo_drive.py                 # full flow
    uv run python tools/demo_drive.py briefing leads   # selected steps
    ORCHESTRATOR_URL=http://localhost:8787 uv run python tools/demo_drive.py cu

Steps: reset, briefing, mueller, leads, cu, notice, approval, delegate, call
"""

import asyncio
import json
from pathlib import Path
import subprocess
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("ORCHESTRATOR_URL", "http://localhost:8787").rstrip("/")
WORLD = os.environ.get("MOCK_WORLD_URL", "http://localhost:8700").rstrip("/")
SESSION = os.environ.get("SESSION_ID", "demo")


def post(url, body=None):
    req = urllib.request.Request(
        url, data=json.dumps(body or {}).encode(), headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return {"ok": False, "status": e.code, "error": e.read().decode()[:300]}


def tool(name, **args):
    t0 = time.monotonic()
    res = post(f"{BASE}/tools/{name}?sessionId={SESSION}", args)
    ms = (time.monotonic() - t0) * 1000
    status = "ok " if res.get("ok") else "ERR"
    print(f"  {status} {name:<20} {ms:6.0f} ms  {json.dumps(res.get('result', res.get('error')), ensure_ascii=False)[:110]}")
    return res


def get(url):
    with urllib.request.urlopen(url, timeout=10) as res:
        return json.loads(res.read())


def wait_task(task_id, timeout=120):
    """Polls the cu-worker until the task finishes (computer use only)."""
    cu = os.environ.get("CU_WORKER_URL", "http://localhost:8800").rstrip("/")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            state = get(f"{cu}/tasks/{task_id}")
        except urllib.error.HTTPError:
            state = {"status": "pending"}
        if state.get("status") in ("done", "failed", "cancelled"):
            return state
        time.sleep(1)
    return {"status": "timeout"}


def reset():
    print("reset", flush=True)
    result = post(f"{BASE}/demo/reset")
    if not result.get("ok"):
        raise RuntimeError(f"Reset fehlgeschlagen: {result}")


def briefing():
    print("briefing: 'Jarvis, was ist heute wichtig?'")
    tool("get_briefing")
    time.sleep(7)  # briefing.item events are spaced ~1.2 s apart


def leads():
    print("leads: 'Wie sieht meine Pipeline aus?'")
    tool("list_leads", limit=10)
    tool("render_widget", dataset="pipeline_by_month")
    time.sleep(4)
    tool("render_widget", dataset="leads_by_city", kind="map")
    tool("focus_entity", entity="lead", entityId="L-007", label="Müller GmbH")
    time.sleep(4)


def cu():
    mode = os.environ.get("CU_MODE", "assisted")
    print(f"cu ({mode}): 'Trag Dr. Weber für Dienstag zehn Uhr in der Praxis-App ein.'")
    res = tool(
        "start_computer_task",
        instruction="Trage Dr. Anna Weber für nächsten Dienstag 10:00 mit Grund Erstgespräch ein",
        mode=mode,
    )
    task_id = (res.get("result") or {}).get("taskId")
    if task_id:
        state = wait_task(task_id)
        print(f"  -> {state.get('status')} in {state.get('durationMs', '?')} ms, {state.get('steps', '?')} steps")
    time.sleep(3)


def notice():
    print("notice: dringende Mail von Thomas Müller kommt rein")
    t0 = time.monotonic()
    res = post(f"{BASE}/demo/notice/urgent-mail?sessionId={SESSION}")
    ms = (time.monotonic() - t0) * 1000
    if res.get("ok"):
        n = res["notice"]
        print(f"  ok  {'notice':<20} {ms:6.0f} ms  {n['title']}: {n['detail']} ({n.get('entityId')})")
    else:
        print(f"  ERR {'notice':<20} {ms:6.0f} ms  {res.get('error')}")
    time.sleep(6)


def approval():
    print("approval: Mail an Dr. Weber (Freigabe)")
    tool("send_email", to="anna.weber@praxis-weber.example", subject="Ihr Termin am Dienstag", body="Guten Tag Frau Dr. Weber, ...")
    print("  -> jetzt im HUD auf 'Freigeben' klicken (approvalId steht nur im Event)")
    time.sleep(10)


def delegate():
    print("delegate: 'Fasse die drei wichtigsten Leads zusammen' (braucht LLM-Key)")
    tool("delegate_task", instruction="Fasse die drei wichtigsten Leads zusammen.")
    time.sleep(4)


def mueller():
    """Rehearse the complete run, explicitly approve its plan and verify persisted writes."""
    try:
        from websockets.asyncio.client import connect
    except ImportError:
        python = Path(__file__).resolve().parents[1] / ".venv/bin/python"
        if python.exists() and str(python) != sys.executable:
            subprocess.run([str(python), __file__, "mueller"], check=True)
            return
        raise RuntimeError("Bitte zuerst make install ausführen (websockets fehlt).") from None

    async def drive():
        from urllib.parse import quote
        events = []
        started = time.monotonic()
        before = {name: get(f"{WORLD}/api/{name}") for name in ("emails", "events", "chat", "leads")}
        ws_url = BASE.replace("http://", "ws://").replace("https://", "wss://")
        async with connect(f"{ws_url}/events?sessionId={quote(SESSION)}") as ws:
            accepted = await asyncio.to_thread(post, f"{BASE}/demo/run/mueller?sessionId={quote(SESSION)}")
            if not accepted.get("ok"):
                raise RuntimeError(f"Lauf nicht angenommen: {accepted}")
            run_id = accepted['result']['taskId']
            async with asyncio.timeout(30):
                async for raw in ws:
                    event = json.loads(raw)
                    payload = event['payload']
                    if payload.get('runId', payload.get('taskId')) not in (None, run_id):
                        continue
                    events.append(event)
                    elapsed = time.monotonic()-started
                    if event['type'].startswith(('run.', 'agent.', 'approval.')):
                        print(f"  {elapsed:5.2f}s {event['type']:<20} {payload.get('app', '')} {payload.get('caption', payload.get('title', ''))}")
                    if event['type'] == 'run.planned':
                        print('  Probe: angezeigten Gesamtplan einmal freigeben')
                        result = await asyncio.to_thread(post, f"{BASE}/tools/resolve_approval?sessionId={quote(SESSION)}", {'approvalId': payload['approvalId'], 'approved': True})
                        if not result.get('ok'):
                            raise RuntimeError('Freigabe fehlgeschlagen')
                    if event['type'] in ('task.done', 'task.failed') and payload.get('taskId') == run_id:
                        break
        after = {name: get(f"{WORLD}/api/{name}") for name in before}
        added = {name: [x for x in after[name] if x['id'] not in {r['id'] for r in before[name]}] for name in ('emails', 'events', 'chat')}
        lead = next(x for x in after['leads'] if x['company'] == 'Müller GmbH')
        checks = {
            'mailSent': any(x['folder'] == 'sent' and x['to'] == lead['email'] and x['leadId'] == lead['id'] for x in added['emails']),
            'calendarCreated': any(x['leadId'] == lead['id'] and 'T15:00:00' in x['start'] for x in added['events']),
            'chatPosted': any(x['channel'] == 'vertrieb' and x['fromJarvis'] for x in added['chat']),
            'dealMoved': lead['status'] == 'verhandlung',
            'agentsFinished': sum(e['type'] == 'agent.finished' and e['payload']['ok'] for e in events) == 4,
            'taskDone': events[-1]['type'] == 'task.done',
        }
        summaries = [e['payload'] for e in events if e['type'] == 'run.summary']
        summary = summaries[-1] if summaries else None
        checks['duration8to15Seconds'] = summary is not None and 8000 <= summary['durationMs'] <= 15000
        evidence = {'runId': run_id, 'elapsedMs': round((time.monotonic()-started)*1000), 'summary': summary, 'checks': checks, 'events': events, 'writes': added, 'lead': lead}
        path = Path(os.environ.get('DEMO_EVIDENCE_PATH', str(Path(__file__).resolve().parents[1] / 'services/orchestrator/evidence/mueller-run.json')))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
        print(f"  Ergebnis: {json.dumps(summary, ensure_ascii=False)}")
        print(f"  Nachweis: {path}")
        if not all(checks.values()):
            raise RuntimeError(f"Abnahme fehlgeschlagen: {checks}")
    print("mueller: 'Kümmer dich um die Müller GmbH' (mit einmaliger Probe-Freigabe)")
    asyncio.run(drive())


def call():
    print("call: 'Ruf mich an, wenn du fertig bist' (braucht Telefonie)")
    tool("place_call", to="me", purpose="Angebot fertig")
    time.sleep(4)


STEPS = {f.__name__: f for f in (reset, briefing, mueller, leads, cu, notice, approval, delegate, call)}

if __name__ == "__main__":
    for name in sys.argv[1:] or list(STEPS):
        STEPS[name]()
