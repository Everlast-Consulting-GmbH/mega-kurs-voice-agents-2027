import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from jarvis_contracts import make_event, parse_event

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text())


@pytest.mark.parametrize("raw", load("events.valid.json"), ids=lambda e: e["type"])
def test_valid_fixtures_parse(raw):
    ev = parse_event(raw)
    assert ev.type == raw["type"]


@pytest.mark.parametrize("raw", load("events.invalid.json"))
def test_invalid_fixtures_rejected(raw):
    with pytest.raises(ValidationError):
        parse_event(raw)


def test_make_event_roundtrip():
    ev = make_event("ui.focus", {"entity": "lead", "entityId": "L-1", "label": "Müller GmbH"})
    assert parse_event(json.dumps(ev)).payload.entityId == "L-1"


def test_make_event_rejects_bad_payload():
    with pytest.raises(ValidationError):
        make_event("voice.state", {"state": "dancing"})


def test_make_event_drops_none_because_ts_optional_is_not_nullable():
    # Zod .optional() rejects null; the HUD silently dropped such events before.
    ev = make_event(
        "briefing.item",
        {"index": 0, "total": 5, "icon": "calendar", "title": "x", "detail": "y",
         "metric": {"label": "Termine", "value": 2, "unit": None}},
    )
    assert "unit" not in ev["payload"]["metric"]


def test_make_event_keeps_none_inside_free_form_data():
    # ui.widget data is opaque; only optional contract fields are pruned, list items stay intact.
    ev = make_event("ui.widget", {"widgetId": "w", "kind": "table", "title": "t", "data": [{"a": None}]})
    assert ev["payload"]["data"] == [{"a": None}]


def test_opaque_fields_are_never_pruned_even_when_none():
    # data is required on ui.widget; pruning it would turn a bad dataset into a missing field.
    ev = make_event("ui.widget", {"widgetId": "w", "kind": "table", "title": "t", "data": None})
    assert "data" in ev["payload"] and ev["payload"]["data"] is None
