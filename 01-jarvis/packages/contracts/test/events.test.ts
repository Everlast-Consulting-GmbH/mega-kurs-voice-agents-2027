import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JarvisEvent, makeEvent, safeParseEvent } from "../src/index.js";

const load = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")) as unknown[];

describe("JarvisEvent contract", () => {
  it("accepts every valid fixture", () => {
    for (const raw of load("events.valid.json")) {
      const r = safeParseEvent(raw);
      expect(r.success, JSON.stringify(raw)).toBe(true);
    }
  });

  it("rejects every invalid fixture", () => {
    for (const raw of load("events.invalid.json")) {
      expect(safeParseEvent(raw).success, JSON.stringify(raw)).toBe(false);
    }
  });

  it("covers every event type with a valid fixture", () => {
    const covered = new Set(load("events.valid.json").map((e) => (e as { type: string }).type));
    const all = JarvisEvent.options.map((o) => o.shape.type.value);
    expect([...covered].sort()).toEqual([...all].sort());
  });

  it("makeEvent produces valid events with unique ids", () => {
    const a = makeEvent("voice.state", { state: "thinking" });
    const b = makeEvent("voice.state", { state: "speaking" });
    expect(JarvisEvent.parse(a)).toEqual(a);
    expect(a.id).not.toBe(b.id);
  });
});
