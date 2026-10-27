"""Shared demo oracle for worker and benchmark; all reads use the REST contract."""

import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

INSTRUCTION = "Trage Dr. Anna Weber für nächsten Dienstag 10:00 mit Grund Erstgespräch ein"


def reference_date(today=None):
    today = today or datetime.now(ZoneInfo("Europe/Berlin")).date()
    return today + timedelta(days=(1 - today.weekday()) % 7 or 7)


def is_reference_instruction(text):
    # Deliberately narrow: a deterministic fallback must not ignore extra requests.
    return (
        re.fullmatch(
            r"(?:bitte )?trage (?:dr\.? )?anna weber für (?:den )?nächsten dienstag "
            r"(?:um )?10:00(?: uhr)? mit (?:dem )?grund [\"„]?erstgespräch[\"“]? ein[.!]?",
            text.strip().lower(),
        )
        is not None
    )


def matching_appointment(rows, day, previous_ids):
    for row in rows:
        try:
            start = datetime.fromisoformat(row["start"])
            if start.tzinfo is None:
                continue
            local = start.astimezone(ZoneInfo("Europe/Berlin"))
            if (
                row["id"] not in previous_ids
                and row["patientId"] == "P-001"
                and local.date() == day
                and (local.hour, local.minute) == (10, 0)
                and row["reason"] == "Erstgespräch"
                and row["status"] in {"geplant", "bestaetigt"}
            ):
                return row
        except (KeyError, ValueError, TypeError):
            continue
    return None


async def appointments(praxis_url):
    async with httpx.AsyncClient(timeout=3) as client:
        response = await client.get(praxis_url.rstrip("/") + "/api/appointments")
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list):
            raise RuntimeError("Praxis-App liefert keine Terminliste.")
        return rows
