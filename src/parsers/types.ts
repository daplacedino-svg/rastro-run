export interface TrackPoint {
  lat: number;
  lon: number;
  ele?: number;
  /** epoch em ms */
  time?: number;
}

export interface RawTrack {
  name?: string;
  points: TrackPoint[];
  /** distância total informada pelo arquivo (FIT/TCX), em metros */
  reportedDistance?: number;
}

export class TrackParseError extends Error {}
