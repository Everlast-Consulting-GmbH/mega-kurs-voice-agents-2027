import json

import pytest
import respx
from claude_agent_sdk import ResultMessage
from jarvis_orchestrator import agent as module
from jarvis_orchestrator.config import Settings
from jarvis_orchestrator.contracts import INPUTS
from test_gateway import LEAD
from test_tasks import runtime, until


def result_message(**kwargs):
    return ResultMessage(
        **dict(
            subtype="success",
            duration_ms=10,
            duration_api_ms=10,
            is_error=False,
            num_turns=2,
            session_id="sdk",
            result="Leo, Müller GmbH: 84.000 Euro.",
            **kwargs,
        )
    )


@respx.mock
async def test_sdk_adapter_uses_contract_tools_and_produces_progress(monkeypatch):
    captured = {}
    real_server = module.create_sdk_mcp_server

    def create_server(name, tools):
        captured["tools"] = {t.name: t for t in tools}
        return real_server(name, tools=tools)

    monkeypatch.setattr(module, "create_sdk_mcp_server", create_server)

    class Client:
        def __init__(self, *, options):
            captured["options"] = options

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def query(self, instruction):
            captured["instruction"] = instruction

        async def receive_response(self):
            result = await captured["tools"]["list_leads"].handler({"limit": 3})
            assert json.loads(result["content"][0]["text"])["result"][0]["id"] == "L-007"
            yield result_message()

    monkeypatch.setattr(module, "ClaudeSDKClient", Client)
    respx.get("http://localhost:8700/api/leads", params={"limit": 3}).respond(json=[LEAD])
    async with runtime(Settings(api_key="test-only")) as (_, client, queue):
        accepted = (
            await client.post(
                "/tools/delegate_task",
                json={"instruction": "Fasse die drei wichtigsten Leads zusammen"},
            )
        ).json()
        events = await until(queue, "task.done")
        assert events[-1]["payload"]["result"] == "Leo, Müller GmbH: 84.000 Euro."
        inner = [
            e
            for e in events
            if e["type"] == "tool.started" and e["payload"]["tool"] == "list_leads"
        ]
        assert inner[0]["payload"]["taskId"] == accepted["result"]["taskId"]
        assert any(e["type"] == "task.progress" and e["payload"].get("step") == 1 for e in events)
    options = captured["options"]
    assert options.model == "claude-haiku-5-5"
    assert options.tools == []
    assert options.strict_mcp_config and options.setting_sources == []
    assert options.permission_mode == "dontAsk"
    assert options.max_turns == 12
    assert "resolve_approval" not in captured["tools"]
    assert "send_email" not in captured["tools"]
    assert "delegate_task" not in captured["tools"]
    assert {name: t.input_schema for name, t in captured["tools"].items()} == {
        name: INPUTS[name] for name in captured["tools"]
    }
    assert all(f"mcp__jarvis__{name}" in options.allowed_tools for name in captured["tools"])
    assert "L-007" in options.system_prompt and "P-001" in options.system_prompt


@pytest.mark.parametrize("outcome", ["error", "empty", "missing"])
async def test_sdk_failure_never_becomes_task_done(monkeypatch, outcome):
    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def query(self, instruction):
            pass

        async def receive_response(self):
            if outcome == "missing":
                return
            message = result_message()
            if outcome == "error":
                message.is_error = True
                message.result = "upstream secret error"
            else:
                message.result = ""
            yield message

    monkeypatch.setattr(module, "ClaudeSDKClient", Client)
    async with runtime(Settings(api_key="test-only")) as (_, client, queue):
        await client.post("/tools/delegate_task", json={"instruction": "Test"})
        events = await until(queue, "task.failed")
        assert "secret" not in json.dumps(events)
        assert not any(e["type"] == "task.done" for e in events)


def test_results_are_plain_spoken_text():
    # task.done results are read aloud by the voice agent; markdown must not reach it.
    from jarvis_orchestrator.agent import spoken_text

    raw = "## Top-Leads\n- **Müller GmbH** (Score 92): Angebot offen.\n* `L-003` __Schmidt AG__: Termin.\n1. Weber"
    assert spoken_text(raw) == "Top-Leads. Müller GmbH (Score 92): Angebot offen. L-003 Schmidt AG: Termin. Weber"
