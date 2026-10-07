// Polyline codificada (formato do Google, usado no summary_polyline do Strava) → miniatura SVG.

export function decodePolyline(str: string): [number, number][] {
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < str.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

/** Desenho do trajeto num quadrado `size`×`size`, mantendo a proporção (path do SVG). */
export function polylineToSvgPath(encoded: string, size: number, pad = 4): string {
  const pts = decodePolyline(encoded);
  if (pts.length < 2) return '';
  const k = Math.cos((pts[0][0] * Math.PI) / 180); // longitude encolhe com a latitude
  const xs = pts.map(([, lon]) => lon * k);
  const ys = pts.map(([lat]) => -lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
  const scale = (size - pad * 2) / span;
  const offX = (size - (Math.max(...xs) - minX) * scale) / 2;
  const offY = (size - (Math.max(...ys) - minY) * scale) / 2;
  return pts
    .map((_, i) => `${i ? 'L' : 'M'}${(offX + (xs[i] - minX) * scale).toFixed(1)} ${(offY + (ys[i] - minY) * scale).toFixed(1)}`)
    .join('');
}
