"""X11 actions; CDP only prepares the known start page, without reading the DOM."""

import asyncio
import math
import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from PIL import Image

from .actions import ACTIONS


async def command(*args, data=None, capture=True):
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE if data is not None else asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE if capture else asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE if capture else asyncio.subprocess.DEVNULL,
    )
    try:
        async with asyncio.timeout(5):
            out, _ = await proc.communicate(data)
        if proc.returncode:
            raise RuntimeError(f"Desktop-Befehl fehlgeschlagen: {args[0]}")
        return out
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()


def coordinate(value):
    if (
        not isinstance(value, (list, tuple))
        or len(value) != 2
        or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in value)
    ):
        raise ValueError("Ungültige Koordinaten")
    x, y = map(round, value)
    if not (0 <= x < 1280 and 0 <= y < 800):
        raise ValueError("Koordinaten außerhalb des Bildschirms")
    return x, y


def key_name(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_]+(?:\+[A-Za-z0-9_]+)*", value):
        raise ValueError("Ungültige Taste")
    aliases = {
        "CTRL": "ctrl",
        "Control": "ctrl",
        "Enter": "Return",
        "ESC": "Escape",
        "PageDown": "Next",
        "PageUp": "Prior",
    }
    return "+".join(aliases.get(k, k) for k in value.split("+"))


class Desktop:
    async def prepare(self, url, cdp_url):
        from .browser import browser_page

        async with browser_page(url, cdp_url) as page:
            await page.wait_for_load_state("networkidle", timeout=5000)

    async def screenshot(self):
        path = Path("/tmp") / f"jarvis-screen-{uuid4().hex}.png"
        try:
            await command("scrot", "-z", str(path))
            data = path.read_bytes()
        finally:
            path.unlink(missing_ok=True)
        with Image.open(BytesIO(data)) as im:
            if im.size != (1280, 800):
                raise RuntimeError("Desktop muss 1280 × 800 Pixel groß sein")
        return data

    async def position(self):
        output = (await command("xdotool", "getmouselocation", "--shell")).decode()
        values = dict(line.split("=", 1) for line in output.splitlines() if "=" in line)
        return int(values["X"]), int(values["Y"])

    async def move(self, point, smooth=False):
        x, y = coordinate(point)
        if smooth:
            ox, oy = await self.position()
            for i in range(1, 7):
                await command(
                    "xdotool",
                    "mousemove",
                    str(round(ox + (x - ox) * i / 6)),
                    str(round(oy + (y - oy) * i / 6)),
                )
                await asyncio.sleep(0.012)
        else:
            await command("xdotool", "mousemove", str(x), str(y))

    async def release(self):
        await command("xdotool", "mouseup", "1", "keyup", "ctrl", "alt", "shift", "super")

    async def execute(self, name, args):
        if name not in ACTIONS:
            raise ValueError("Unbekannte Computer-Aktion")
        if name == "screenshot":
            return await self.screenshot()
        if name == "zoom":
            region = args["region"]
            if len(region) != 4:
                raise ValueError("Ungültiger Bildausschnitt")
            x0, y0 = coordinate(region[:2])
            x1, y1 = region[2:]
            if not (x0 < x1 <= 1280 and y0 < y1 <= 800):
                raise ValueError("Ungültiger Bildausschnitt")
            with Image.open(BytesIO(await self.screenshot())) as im:
                cropped = im.crop((x0, y0, x1, y1))
                factor = min(1280 / cropped.width, 800 / cropped.height)
                cropped = cropped.resize((round(cropped.width * factor), round(cropped.height * factor)))
                out = BytesIO()
                cropped.save(out, "PNG")
                return out.getvalue()
        if name == "cursor_position":
            return str(await self.position())
        if "coordinate" in args and name != "left_click_drag":
            await self.move(args["coordinate"])
        modifiers = (
            args.get("text")
            if name
            in {
                "left_click",
                "right_click",
                "middle_click",
                "double_click",
                "triple_click",
                "scroll",
                "left_click_drag",
            }
            else None
        )
        if modifiers:
            if any(k not in {"ctrl", "shift", "alt", "super"} for k in modifiers.split("+")):
                raise ValueError("Ungültige Modifikatortaste")
            await command("xdotool", "keydown", modifiers)
        try:
            if name.endswith("click"):
                button = {"right_click": 3, "middle_click": 2}.get(name, 1)
                repeat = {"double_click": 2, "triple_click": 3}.get(name, 1)
                await command("xdotool", "click", "--repeat", str(repeat), "--delay", "80", str(button))
            elif name == "type":
                # Clipboard preserves umlauts and is much faster than per-key typing.
                text = args["text"]
                if not isinstance(text, str) or len(text) > 20000:
                    raise ValueError("Ungültiger Eingabetext")
                await command("xclip", "-selection", "clipboard", "-in", data=text.encode(), capture=False)
                await command("xdotool", "key", "--clearmodifiers", "ctrl+v")
            elif name in {"key", "hold_key"}:
                key = key_name(args["text"])
                if name == "key":
                    repeat = args.get("repeat", 1)
                    if not isinstance(repeat, int) or not 1 <= repeat <= 100:
                        raise ValueError("Ungültige Wiederholung")
                    await command(
                        "xdotool", "key", "--clearmodifiers", "--repeat", str(repeat), "--delay", "20", key
                    )
                else:
                    duration = float(args["duration"])
                    if not 0 <= duration <= 300:
                        raise ValueError("Ungültige Dauer")
                    await command("xdotool", "keydown", key)
                    try:
                        await asyncio.sleep(duration)
                    finally:
                        await command("xdotool", "keyup", key)
            elif name == "scroll":
                amount = args["scroll_amount"]
                if not isinstance(amount, int) or not 0 <= amount <= 100:
                    raise ValueError("Ungültige Scrollweite")
                if amount:
                    button = {"up": "4", "down": "5", "left": "6", "right": "7"}[args["scroll_direction"]]
                    await command("xdotool", "click", "--repeat", str(amount), "--delay", "20", button)
            elif name == "left_click_drag":
                await self.move(args["start_coordinate"])
                await command("xdotool", "mousedown", "1")
                try:
                    await self.move(args["coordinate"], smooth=True)
                finally:
                    await command("xdotool", "mouseup", "1")
            elif name in {"left_mouse_down", "left_mouse_up"}:
                await command("xdotool", "mousedown" if name.endswith("down") else "mouseup", "1")
            elif name == "wait":
                duration = float(args["duration"])
                if not 0 <= duration <= 300:
                    raise ValueError("Ungültige Dauer")
                await asyncio.sleep(duration)
        finally:
            if modifiers:
                await command("xdotool", "keyup", modifiers)
        # A short paint window, not a multi-second sleep after every action.
        if name not in {"wait", "cursor_position"}:
            await asyncio.sleep(0.05)
        return "OK"
