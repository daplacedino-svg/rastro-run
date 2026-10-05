const R = 6371008.8;
const toRad = Math.PI / 180;
const toDeg = 180 / Math.PI;

export type LngLat = [number, number];

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rumo de a para b, em graus (0 = norte, sentido horário), no plano Mercator. */
export function bearing(a: LngLat, b: LngLat): number {
  const [ax, ay] = toMercator(a);
  const [bx, by] = toMercator(b);
  return Math.atan2(bx - ax, -(by - ay)) * toDeg;
}

/** Mercator normalizado (0..1), igual ao MercatorCoordinate do MapLibre. */
export function toMercator([lon, lat]: LngLat): [number, number] {
  const x = (180 + lon) / 360;
  const y = (180 - toDeg * Math.log(Math.tan(Math.PI / 4 + (lat * toRad) / 2))) / 360;
  return [x, y];
}

export function fromMercator([x, y]: [number, number]): LngLat {
  const lon = x * 360 - 180;
  const y2 = 180 - y * 360;
  const lat = (360 / Math.PI) * Math.atan(Math.exp(y2 * toRad)) - 90;
  return [lon, lat];
}

/** Metros por unidade Mercator na latitude dada. */
export function metersPerMercatorUnit(lat: number): number {
  return 2 * Math.PI * R * Math.cos(lat * toRad);
}

/** Diferença angular normalizada para (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
