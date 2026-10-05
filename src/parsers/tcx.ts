import { TrackParseError, type RawTrack, type TrackPoint } from './types';

function first(el: Element, localName: string): Element | undefined {
  return el.getElementsByTagNameNS('*', localName)[0];
}

function num(el: Element | undefined): number {
  return el ? parseFloat(el.textContent ?? '') : NaN;
}

export function parseTcx(text: string): RawTrack {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new TrackParseError('O arquivo TCX está corrompido ou não é XML válido.');
  }

  const points: TrackPoint[] = [];
  let lastDistance = NaN;
  for (const tp of Array.from(doc.getElementsByTagNameNS('*', 'Trackpoint'))) {
    const pos = first(tp, 'Position');
    const d = num(first(tp, 'DistanceMeters'));
    if (Number.isFinite(d)) lastDistance = d;
    if (!pos) continue;
    const lat = num(first(pos, 'LatitudeDegrees'));
    const lon = num(first(pos, 'LongitudeDegrees'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = num(first(tp, 'AltitudeMeters'));
    const time = Date.parse(first(tp, 'Time')?.textContent ?? '');
    points.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : undefined,
      time: Number.isFinite(time) ? time : undefined,
    });
  }

  // Soma das voltas é a distância "oficial" do relógio.
  let lapsTotal = 0;
  for (const lap of Array.from(doc.getElementsByTagNameNS('*', 'Lap'))) {
    const direct = Array.from(lap.children).find((c) => c.localName === 'DistanceMeters');
    const d = num(direct);
    if (Number.isFinite(d)) lapsTotal += d;
  }

  const reportedDistance = lapsTotal > 0 ? lapsTotal : Number.isFinite(lastDistance) ? lastDistance : undefined;
  const name = first(doc.documentElement, 'Activity')?.getAttribute('Sport') ?? undefined;
  return { name, points, reportedDistance };
}
