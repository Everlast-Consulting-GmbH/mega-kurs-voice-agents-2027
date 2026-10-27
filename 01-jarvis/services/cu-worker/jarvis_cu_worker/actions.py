"""Translate all 17 toolset members into the existing HUD vocabulary."""

ACTIONS = {
    "left_click": ("click", "Klicke auf die markierte Stelle"),
    "right_click": ("click", "Rechtsklick auf die markierte Stelle"),
    "middle_click": ("click", "Klicke mit der mittleren Maustaste"),
    "double_click": ("double_click", "Doppelklick auf die markierte Stelle"),
    "triple_click": ("click", "Dreifachklick auf die markierte Stelle"),
    "left_mouse_down": ("drag", "Halte die linke Maustaste"),
    "left_mouse_up": ("drag", "Lasse die linke Maustaste los"),
    "left_click_drag": ("drag", "Ziehe zur markierten Stelle"),
    "mouse_move": ("move", "Bewege den Mauszeiger"),
    "cursor_position": ("move", "Prüfe die Mausposition"),
    "screenshot": ("screenshot", "Prüfe den Bildschirm"),
    "zoom": ("screenshot", "Vergrößere den markierten Bereich"),
    "type": ("type", "Schreibe den Text"),
    "key": ("key", "Drücke die Taste"),
    "hold_key": ("key", "Halte die Taste"),
    "wait": ("wait", "Warte auf die Anwendung"),
    "scroll": ("scroll", "Scrolle"),
}


def action_payload(task_id, name, args, step, cursor, *, target=None, caption=None, total=None):
    kind, label = ACTIONS[name]
    x, y = args.get("coordinate", cursor)
    if name == "zoom":
        x0, y0, x1, y1 = args["region"]
        target = dict(x=x0, y=y0, width=x1 - x0, height=y1 - y0)
    if target is None:
        if name in {"screenshot", "wait"}:
            target = dict(x=0, y=0, width=1280, height=800)
        else:
            left, top = max(0, min(1248, x - 16)), max(0, min(768, y - 16))
            target = dict(x=left, y=top, width=32, height=32)
    if name in {"type", "key", "hold_key"}:
        label += f": „{args.get('text', '')[:100]}“"
    if name == "scroll":
        direction = {"up": "oben", "down": "unten", "left": "links", "right": "rechts"}[
            args["scroll_direction"]
        ]
        label += f" nach {direction}"
    payload = dict(taskId=task_id, action=kind, x=x, y=y, target=target, caption=caption or label, step=step)
    if "text" in args:
        payload["text"] = args["text"]
    if total is not None:
        payload["totalSteps"] = total
    return payload
