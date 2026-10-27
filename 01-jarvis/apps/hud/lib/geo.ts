// Simplified outline of Germany (lng, lat), clockwise from the Danish border.
// Accurate to a few kilometres, which is plenty for a HUD radar.
export const GERMANY: Array<[number, number]> = [
  [8.66, 54.91], [9.42, 54.83], [9.95, 54.78], [10.03, 54.55], [10.9, 54.37], [11.1, 54.52], [11.3, 54.4],
  [10.85, 54.05], [11.1, 53.95], [11.5, 54.03], [12.1, 54.18], [12.5, 54.47], [13.0, 54.44], [13.4, 54.68],
  [13.7, 54.55], [13.8, 54.15], [14.22, 53.93], [14.42, 53.27], [14.12, 52.85], [14.64, 52.57], [14.53, 52.4],
  [14.76, 52.07], [14.6, 51.8], [14.98, 51.45], [15.04, 51.1], [14.82, 50.87], [14.3, 51.05], [14.4, 50.9],
  [13.9, 50.79], [13.2, 50.5], [12.5, 50.4], [12.1, 50.32], [12.26, 50.06], [12.5, 49.98], [12.4, 49.75],
  [12.68, 49.52], [13.03, 49.3], [13.4, 49.05], [13.84, 48.77], [13.73, 48.52], [13.44, 48.56], [13.0, 48.24],
  [12.76, 48.12], [13.0, 47.85], [12.98, 47.47], [12.74, 47.68], [12.2, 47.6], [11.6, 47.58], [11.1, 47.4],
  [10.45, 47.55], [10.18, 47.28], [9.97, 47.54], [9.56, 47.54], [8.84, 47.69], [8.56, 47.8], [8.4, 47.6],
  [7.6, 47.58], [7.5, 47.7], [7.58, 48.12], [7.8, 48.6], [8.22, 48.97], [7.94, 49.04], [7.45, 49.18],
  [6.73, 49.17], [6.36, 49.47], [6.5, 49.8], [6.13, 50.13], [6.4, 50.33], [6.02, 50.75], [5.97, 51.05],
  [6.17, 51.18], [6.07, 51.4], [6.2, 51.52], [5.95, 51.75], [6.17, 51.84], [6.75, 51.9], [7.05, 52.24],
  [6.7, 52.48], [7.05, 52.65], [7.2, 53.24], [7.0, 53.5], [7.3, 53.7], [8.0, 53.71], [8.15, 53.5],
  [8.55, 53.55], [8.7, 53.87], [9.0, 53.92], [8.83, 54.3], [8.6, 54.35], [8.85, 54.6], [8.66, 54.91],
];

export const BOUNDS = { minLng: 5.8, maxLng: 15.1, minLat: 47.2, maxLat: 55.1 };

/** Equirectangular projection with cos(lat) correction into a w x h box (keeps aspect). */
export function makeProjection(w: number, h: number, pad = 8) {
  const midLat = ((BOUNDS.minLat + BOUNDS.maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);
  const spanX = (BOUNDS.maxLng - BOUNDS.minLng) * kx;
  const spanY = BOUNDS.maxLat - BOUNDS.minLat;
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * scale) / 2;
  const oy = (h - spanY * scale) / 2;
  return (lng: number, lat: number): [number, number] => [ox + (lng - BOUNDS.minLng) * kx * scale, oy + (BOUNDS.maxLat - lat) * scale];
}

export function outlinePath(project: (lng: number, lat: number) => [number, number]) {
  return GERMANY.map(([lng, lat], i) => {
    const [x, y] = project(lng, lat);
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("") + "Z";
}
