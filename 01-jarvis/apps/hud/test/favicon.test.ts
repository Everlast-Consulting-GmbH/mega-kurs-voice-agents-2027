import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("favicon", () => {
  it("ships the Jarvis diamond as app/icon.svg (Next.js serves it as favicon)", () => {
    const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
    expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain("#00e5ff");
  });
});
