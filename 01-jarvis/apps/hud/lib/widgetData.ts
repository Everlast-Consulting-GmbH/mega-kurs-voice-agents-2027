// ui.widget carries `data: unknown`; these helpers accept the documented shapes
// (bar/line: [{label,value}], map: [{label,lat,lng,value}], table: rows) and drop the rest.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : isObj(v) && Array.isArray(v.items) ? v.items : []);

export type SeriesPoint = { label: string; value: number };
export type MapPoint = SeriesPoint & { lat: number; lng: number };

export function toSeries(data: unknown): SeriesPoint[] {
  return arr(data).flatMap((d) => (isObj(d) && typeof d.value === "number" ? [{ label: String(d.label ?? ""), value: d.value }] : []));
}

export function toPoints(data: unknown): MapPoint[] {
  return arr(data).flatMap((d) =>
    isObj(d) && typeof d.lat === "number" && typeof d.lng === "number"
      ? [{ label: String(d.label ?? ""), lat: d.lat, lng: d.lng, value: typeof d.value === "number" ? d.value : 1 }]
      : [],
  );
}

export function toRows(data: unknown): { columns: string[]; rows: Obj[] } {
  if (isObj(data) && Array.isArray(data.rows)) {
    const rows = data.rows.filter(isObj);
    const columns = Array.isArray(data.columns) ? data.columns.map(String) : [...new Set(rows.flatMap(Object.keys))];
    return { columns, rows };
  }
  const rows = arr(data).filter(isObj);
  return { columns: [...new Set(rows.flatMap(Object.keys))], rows };
}

export function toStat(data: unknown): { value: number; label?: string; unit?: string; delta?: number } | null {
  if (typeof data === "number") return { value: data };
  if (isObj(data) && typeof data.value === "number")
    return {
      value: data.value,
      label: typeof data.label === "string" ? data.label : undefined,
      unit: typeof data.unit === "string" ? data.unit : undefined,
      delta: typeof data.delta === "number" ? data.delta : undefined,
    };
  return null;
}

/** 486000 -> "486 T", 1_200_000 -> "1,2 Mio" */
export function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000).toLocaleString("de-DE")} T`;
  return Math.round(n).toLocaleString("de-DE");
}
