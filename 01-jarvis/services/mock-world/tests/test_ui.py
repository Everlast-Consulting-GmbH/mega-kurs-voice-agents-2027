import re

import pytest
from fastapi.testclient import TestClient

from jarvis_mock_world.app import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "ui.db")) as client:
        yield client


@pytest.mark.parametrize("path,title", [("/mail", "Postfach"), ("/crm", "Kontakte"), ("/praxis", "PraxisPilot")])
def test_ui_entrypoints_and_assets(client, path, title):
    response = client.get(path)
    assert response.status_code == 200
    assert 'lang="de"' in response.text
    assert title in response.text
    for asset in re.findall(r'(?:src|href)="(/static/[^\"]+)"', response.text):
        assert client.get(asset).status_code == 200


def test_praxis_json_boundary_and_accessible_controls(client):
    page = client.get("/praxis").text
    for label in ["Patienten", "Neuer Termin", "Termin speichern", "Patienten suchen", "Grund"]:
        assert label in page
    script = client.get("/static/praxis.js").text
    api_paths = re.findall(r'["`\'](/[^"`\']*api/[^"`\']*)', script)
    assert api_paths and all(path.startswith("/praxis/api/") for path in api_paths)
    assert "alert(" not in script and "confirm(" not in script
    assert "localStorage" not in script


def test_health_and_context(client):
    assert client.get("/health").json() == {"ok": True}
    context = client.get("/praxis/api/context").json()
    assert context["timezone"] == "Europe/Berlin"
    assert context["practitioner"] == "Dr. Felix Berg"
    assert context["nextTuesday"] > context["today"]


def test_praxis_keeps_computer_use_labels(client):
    # services/cu-worker/jarvis_cu_worker/assisted.py locates these by visible text, label and role.
    text = re.sub(r"<[^>]+>", "", client.get("/praxis").text)
    for label in ["Patienten & Termine", "Patienten suchen", "＋ Neuer Termin", "Datum (JJJJ-MM-TT)", "Grund", "Termin speichern"]:
        assert label in text
    script = client.get("/static/praxis.js").text
    assert 'data-start="${esc(slot.start)}"' in script and 'aria-label="${clock(slot.start)} Uhr' in script
    assert "Termin gespeichert · ${appointment.id}" in script


def test_bundled_font_is_served(client):
    css = client.get("/static/shared.css").text
    font = re.search(r"url\((/static/fonts/[^)]+\.woff2)\)", css).group(1)
    response = client.get(font)
    assert response.status_code == 200 and response.content[:4] == b"wOF2"
