import { describe, expect, it } from "vitest";
import { makeProjection } from "@/lib/geo";
import { toSeries, toRows, toPoints } from "@/lib/widgetData";

describe("makeProjection", () => {
  const p = makeProjection(400, 500, 0);
  it("puts the north above the south and the west left of the east", () => {
    const [hx, hy] = p(9.993, 53.551); // Hamburg
    const [mx, my] = p(11.575, 48.137); // München
    const [kx] = p(6.96, 50.937); // Köln
    expect(hy).toBeLessThan(my);
    expect(kx).toBeLessThan(hx);
    expect(mx).toBeGreaterThan(hx);
  });
  it("keeps every German city inside the box", () => {
    for (const [lng, lat] of [[6.96, 50.937], [13.405, 52.52], [9.182, 48.775], [8.68, 54.9], [12.9, 47.5]] as const) {
      const [x, y] = p(lng, lat);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(400);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(500);
    }
  });
});

describe("widget data coercion", () => {
  it("accepts label/value series and drops junk", () => {
    expect(toSeries([{ label: "Mai", value: 1 }, { label: "x" }, null, 5])).toEqual([{ label: "Mai", value: 1 }]);
    expect(toSeries("nope")).toEqual([]);
  });
  it("accepts map points", () => {
    expect(toPoints([{ label: "München", lat: 48.1, lng: 11.5, value: 3 }, { label: "bad" }])).toHaveLength(1);
  });
  it("accepts table rows and derives columns", () => {
    expect(toRows([{ a: 1, b: "x" }, { a: 2, c: true }])).toEqual({ columns: ["a", "b", "c"], rows: [{ a: 1, b: "x" }, { a: 2, c: true }] });
    expect(toRows({ columns: ["a"], rows: [{ a: 1 }] }).columns).toEqual(["a"]);
  });
});
