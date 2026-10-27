"""Deterministic reference task on the same visible Chromium via CDP."""

import re

from .browser import browser_page
from .reference import is_reference_instruction, reference_date


async def run_assisted(worker, task):
    if not is_reference_instruction(task.instruction):
        raise RuntimeError(
            "Assisted unterstützt nur: Trage Dr. Anna Weber für nächsten Dienstag 10:00 mit Grund Erstgespräch ein"
        )
    day = reference_date().isoformat()
    async with browser_page(worker.settings.praxis_url, worker.settings.cdp_url) as page:
        await worker.frame(task)

        async def action(locator, name, caption, value=None):
            await locator.wait_for(state="visible")
            await locator.scroll_into_view_if_needed()
            box = await locator.bounding_box()
            if box is None:
                raise RuntimeError("Zielelement ist nicht sichtbar.")
            x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

            async def perform():
                await worker.desktop.move((x, y), smooth=True)
                if name == "type":
                    await locator.fill(value)
                    if caption == "Wähle nächsten Dienstag":
                        async with page.expect_response(
                            lambda r: "/praxis/api/slots?date=" + value in r.url
                        ) as pending:
                            await locator.dispatch_event("change")
                        response = await pending.value
                        if not response.ok:
                            raise RuntimeError("Freie Uhrzeiten konnten nicht geladen werden.")
                else:
                    await locator.click()
                return "OK"

            await worker.step(
                task,
                name,
                {"coordinate": [x, y], **({"text": value} if value is not None else {})},
                operation=perform,
                target=box,
                caption=caption,
                total=8,
            )

        await action(
            page.get_by_role("link", name=re.compile("Patienten & Termine")),
            "left_click",
            "Öffne die Patientenübersicht",
        )
        await action(
            page.get_by_label(re.compile(r"^Patient(?:en)? suchen$", re.I)),
            "type",
            "Suche Dr. Anna Weber",
            "Anna Weber",
        )
        await action(
            page.get_by_role("button", name=re.compile(r"(?:Dr\.? )?Anna Weber")),
            "left_click",
            "Wähle Patientin Dr. Anna Weber",
        )
        await action(
            page.get_by_role("button", name=re.compile(r"^(?:＋ )?Neuer Termin$")),
            "left_click",
            "Klicke auf „Neuer Termin“",
        )
        await action(page.get_by_label(re.compile(r"^Datum")), "type", "Wähle nächsten Dienstag", day)
        await action(
            page.get_by_role("button", name="10:00 Uhr", exact=True).and_(
                page.locator(f'[data-start^="{day}"]')
            ),
            "left_click",
            "Wähle 10:00 Uhr",
        )
        await action(
            page.get_by_label("Grund", exact=True), "type", "Trage „Erstgespräch“ ein", "Erstgespräch"
        )
        await action(
            page.get_by_role("button", name="Termin speichern", exact=True),
            "left_click",
            "Speichere den Termin",
        )
        await page.get_by_text(re.compile(r"Termin (?:wurde )?gespeichert|A-101")).first.wait_for(
            state="visible"
        )
        # Text in the DOM is not yet painted; wait two frames so the final screenshot shows it.
        await page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
        await worker.frame(task)
    return "Termin für Dr. Anna Weber gespeichert."
