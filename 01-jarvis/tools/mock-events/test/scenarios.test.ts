import { describe, expect, it } from "vitest";
import { safeParseEvent } from "@jarvis/contracts";
import { SCENARIOS } from "../src/scenarios.js";

describe("mock scenarios", () => {
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    it(`${name}: every event step satisfies the contract`, () => {
      for (const st of steps) {
        if ("waitFor" in st) continue;
        const r = safeParseEvent({ id: "x", ts: 0, sessionId: "demo", type: st.type, payload: st.payload });
        expect(r.success, `${st.type} +${st.at}ms: ${JSON.stringify(r.error?.issues?.[0])}`).toBe(true);
      }
    });
  }

  it("full-demo starts at 0 and contains the computer-use part", () => {
    const full = SCENARIOS["full-demo"]!;
    expect(Math.min(...full.map((s) => s.at))).toBe(0);
    expect(full.length).toBeGreaterThan(SCENARIOS["computer-use"]!.length);
  });
});
