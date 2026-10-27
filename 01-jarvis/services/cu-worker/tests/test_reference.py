from datetime import date

from jarvis_cu_worker.reference import is_reference_instruction, matching_appointment, reference_date


def test_next_tuesday_is_strict_and_date_relative():
    assert reference_date(date(2026, 10, 9)) == date(2026, 10, 13)
    assert reference_date(date(2026, 10, 13)) == date(2026, 10, 20)


def test_reference_does_not_silently_execute_different_or_extra_tasks():
    assert is_reference_instruction(
        "Trage Dr. Anna Weber für nächsten Dienstag 10:00 mit Grund Erstgespräch ein"
    )
    assert not is_reference_instruction("Trage Max Mustermann für Dienstag 10:00 ein")
    assert not is_reference_instruction(
        "Trage Dr. Anna Weber für nächsten Dienstag 11:00 mit Grund Erstgespräch ein"
    )
    assert not is_reference_instruction(
        "Trage Dr. Anna Weber für nächsten Dienstag 10:00 mit Grund Erstgespräch ein und sende eine Mail"
    )


def test_success_requires_correct_new_active_appointment():
    row = dict(
        id="A-101",
        patientId="P-001",
        start="2026-10-13T10:00:00+02:00",
        reason="Erstgespräch",
        status="geplant",
    )
    assert matching_appointment([row], date(2026, 10, 13), set()) == row
    for changed in (
        {"id": "A-100"},
        {"patientId": "P-002"},
        {"start": "2026-10-13T11:00:00+02:00"},
        {"status": "abgesagt"},
    ):
        assert matching_appointment([{**row, **changed}], date(2026, 10, 13), {"A-100"}) is None
