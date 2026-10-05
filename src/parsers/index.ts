import { parseFit } from './fit';
import { parseGpx } from './gpx';
import { parseTcx } from './tcx';
import { TrackParseError, type RawTrack } from './types';

export { TrackParseError } from './types';
export type { RawTrack, TrackPoint } from './types';

/** Lê GPX, TCX ou FIT (pela extensão e, se precisar, pelo conteúdo). */
export async function parseTrackFile(file: File): Promise<RawTrack> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const buffer = await file.arrayBuffer();
  let track: RawTrack;

  const looksFit = buffer.byteLength > 12 && new TextDecoder().decode(new Uint8Array(buffer, 8, 4)) === '.FIT';
  if (ext === 'fit' || looksFit) {
    track = await parseFit(buffer);
  } else {
    const text = new TextDecoder().decode(buffer);
    if (ext === 'tcx' || /<TrainingCenterDatabase/i.test(text.slice(0, 2000))) {
      track = parseTcx(text);
    } else if (ext === 'gpx' || /<gpx/i.test(text.slice(0, 2000))) {
      track = parseGpx(text);
    } else {
      throw new TrackParseError('Formato não suportado. Use um arquivo GPX, FIT ou TCX.');
    }
  }

  if (track.points.length < 2) {
    throw new TrackParseError('O arquivo não tem pontos de GPS suficientes para desenhar o trajeto.');
  }
  return track;
}
