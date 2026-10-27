import { describe, expect, it } from "vitest";
import { activeWordIndex, splitWords } from "@/lib/transcript";
import type { Turn } from "@/lib/events/reducer";

const turn = (p: Partial<Turn>): Turn => ({ turnId: "t", role: "assistant", text: "", final: false, startedAt: 1000, updatedAt: 1000, ...p });

describe("splitWords", () => {
  it("splits on whitespace and drops empties", () => {
    expect(splitWords("  Guten  Morgen. ")).toEqual(["Guten", "Morgen."]);
  });
});

describe("activeWordIndex", () => {
  it("highlights the newest word while deltas are streaming", () => {
    expect(activeWordIndex(turn({ text: "Guten Morgen Leo" }), 5000)).toBe(2);
  });

  it("marks everything spoken once a turn without timings is final", () => {
    expect(activeWordIndex(turn({ text: "Guten Morgen", final: true }), 5000)).toBe(2);
  });

  it("follows word timings relative to the turn start", () => {
    const t = turn({
      text: "Eins zwei drei",
      final: true,
      words: [
        { word: "Eins", startMs: 0, endMs: 300 },
        { word: "zwei", startMs: 300, endMs: 600 },
        { word: "drei", startMs: 600, endMs: 900 },
      ],
    });
    expect(activeWordIndex(t, 1000)).toBe(0);
    expect(activeWordIndex(t, 1350)).toBe(1);
    expect(activeWordIndex(t, 1650)).toBe(2);
    expect(activeWordIndex(t, 1950)).toBe(3);
  });

  it("never runs behind the streamed text when timings lag", () => {
    const t = turn({ text: "Eins zwei", final: false, words: [{ word: "Eins", startMs: 0, endMs: 10_000 }] });
    expect(activeWordIndex(t, 1100)).toBe(1);
  });
});
