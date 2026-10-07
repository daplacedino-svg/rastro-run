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
  let lapsTime = 0;
  for (const lap of Array.from(doc.getElementsByTagNameNS('*', 'Lap'))) {
    const direct = (name: string) => Array.from(lap.children).find((c) => c.localName === name);
    const d = num(direct('DistanceMeters'));
    if (Number.isFinite(d)) lapsTotal += d;
    const t = num(direct('TotalTimeSeconds'));
    if (Number.isFinite(t)) lapsTime += t;
  }

  const reportedDistance = lapsTotal > 0 ? lapsTotal : Number.isFinite(lastDistance) ? lastDistance : undefined;
  const sport = first(doc.documentElement, 'Activity')?.getAttribute('Sport') ?? undefined;
  return { sport, points, reportedDistance, movingTime: lapsTime > 0 ? lapsTime : undefined };
}
