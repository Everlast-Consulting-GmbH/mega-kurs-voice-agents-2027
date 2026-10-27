"""Prepare the known start page; only assisted mode reads or acts on the DOM."""

from contextlib import asynccontextmanager

from playwright.async_api import async_playwright


@asynccontextmanager
async def browser_page(praxis_url, cdp_url):
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(cdp_url, timeout=5000)
        context = browser.contexts[0]
        pages = context.pages
        page = next(
            (p for p in pages if p.url.startswith(praxis_url)),
            pages[0] if pages else await context.new_page(),
        )
        page.set_default_timeout(3000)
        await page.bring_to_front()
        response = await page.goto(praxis_url, wait_until="domcontentloaded")
        if response is None or not response.ok:
            raise RuntimeError("Praxis-App ist nicht erreichbar.")
        yield page
        # Exiting the driver disconnects CDP without closing the shared Chromium.
