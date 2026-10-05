import { TrackParseError, type RawTrack, type TrackPoint } from './types';

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

export async function parseFit(buffer: ArrayBuffer): Promise<RawTrack> {
  // O SDK da Garmin é grande; só baixa quando alguém sobe um .fit.
  const { Decoder, Stream } = await import('@garmin/fitsdk');
  const stream = Stream.fromArrayBuffer(buffer);
  if (!Decoder.isFIT(stream)) {
    throw new TrackParseError('Este arquivo não parece ser um FIT válido.');
  }
  const { messages, errors } = new Decoder(stream).read();
  const records = messages.recordMesgs ?? [];
  if (!records.length && errors.length) {
    throw new TrackParseError('Não foi possível ler o arquivo FIT.');
  }

  const points: TrackPoint[] = [];
  for (const r of records) {
    if (r.positionLat == null || r.positionLong == null) continue;
    const ele = r.enhancedAltitude ?? r.altitude;
    const ts = r.timestamp as unknown;
    points.push({
      lat: Number(r.positionLat) * SEMICIRCLE_TO_DEG,
      lon: Number(r.positionLong) * SEMICIRCLE_TO_DEG,
      ele: ele != null ? Number(ele) : undefined,
      time: ts instanceof Date ? ts.getTime() : undefined,
    });
  }

  const session = messages.sessionMesgs?.[0];
  const reportedDistance = session?.totalDistance != null ? Number(session.totalDistance) : undefined;
  const sport = session?.sport != null ? String(session.sport) : undefined;
  return { name: sport, points, reportedDistance };
}
