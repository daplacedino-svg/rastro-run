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
  /** tempo em movimento informado pelo relógio/serviço, em segundos */
  movingTime?: number;
  /** ganho de elevação informado pelo relógio/serviço, em metros */
  elevationGain?: number;
  /** esporte como veio do arquivo (ex.: "running", "Running") */
  sport?: string;
}

export class TrackParseError extends Error {}
