import { TrackParseError, type RawTrack, type TrackPoint } from './types';

function childText(el: Element, localName: string): string | undefined {
  for (const child of Array.from(el.children)) {
    if (child.localName === localName) return child.textContent?.trim() || undefined;
  }
  return undefined;
}

export function parseGpx(text: string): RawTrack {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new TrackParseError('O arquivo GPX está corrompido ou não é XML válido.');
  }

  // Trilha gravada (trkpt) é o normal; rota planejada (rtept) serve de fallback.
  let nodes = Array.from(doc.getElementsByTagNameNS('*', 'trkpt'));
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagNameNS('*', 'rtept'));

  const points: TrackPoint[] = [];
  for (const node of nodes) {
    const lat = parseFloat(node.getAttribute('lat') ?? '');
    const lon = parseFloat(node.getAttribute('lon') ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = parseFloat(childText(node, 'ele') ?? '');
    const time = Date.parse(childText(node, 'time') ?? '');
    points.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : undefined,
      time: Number.isFinite(time) ? time : undefined,
    });
  }

  const trk = doc.getElementsByTagNameNS('*', 'trk')[0];
  const metadata = doc.getElementsByTagNameNS('*', 'metadata')[0];
  const name = (trk && childText(trk, 'name')) || (metadata && childText(metadata, 'name'));

  return { name, points };
}
