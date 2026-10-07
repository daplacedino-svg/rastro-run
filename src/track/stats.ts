import type { RawTrack } from '../parsers';
import { haversine } from './geo';

/** Números do cartão final. Campos ausentes (null) simplesmente não aparecem. */
export interface RunStats {
  title: string;
  /** epoch ms do início, se o arquivo tiver horário */
  startTime: number | null;
  distance: number;
  movingTime: number | null;
  /** segundos por km */
  pace: number | null;
  elevationGain: number | null;
}

const SPORT_TITLES: [RegExp, string][] = [
  [/trail/i, 'Trail run'],
  [/run|corrida/i, 'Corrida'],
  [/walk|caminhada/i, 'Caminhada'],
  [/hik/i, 'Trilha'],
  [/rid|cycl|bik/i, 'Pedal'],
];

export function computeStats(raw: RawTrack, distance: number): RunStats {
  const times = raw.points.map((p) => p.time);
  const startTime = times.find((t): t is number => t != null) ?? null;
  const movingTime = raw.movingTime ?? movingTimeFromPoints(raw);
  const elevationGain = raw.elevationGain ?? elevationGainFromPoints(raw);
  return {
    title: raw.name?.trim() || sportTitle(raw.sport) || 'Minha corrida',
    startTime,
    distance,
    movingTime: movingTime && movingTime > 0 ? movingTime : null,
    pace: movingTime && distance > 50 ? movingTime / (distance / 1000) : null,
    // 0 m quase sempre é arquivo sem altitude de verdade (ou altitude constante): melhor não mostrar
    elevationGain: elevationGain != null && Number.isFinite(elevationGain) && elevationGain >= 1 ? elevationGain : null,
  };
}

function sportTitle(sport?: string): string | null {
  if (!sport) return null;
  return SPORT_TITLES.find(([re]) => re.test(sport))?.[1] ?? null;
}

/**
 * Tempo em movimento a partir dos pontos: soma só os trechos em que houve deslocamento
 * (paradas em semáforo, pausas do relógio e buracos longos no GPS ficam de fora).
 */
function movingTimeFromPoints(raw: RawTrack): number | null {
  const pts = raw.points;
  let total = 0;
  let timed = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.time == null || b.time == null) continue;
    timed++;
    const dt = (b.time - a.time) / 1000;
    if (dt <= 0 || dt > 120) continue;
    const speed = haversine([a.lon, a.lat], [b.lon, b.lat]) / dt;
    if (speed > 0.5) total += dt;
  }
  return timed > 0 ? total : null;
}

/**
 * Ganho de elevação com a altitude suavizada e um limiar de 3 m: sem isso, o tremido
 * do GPS somaria dezenas de metros "fantasmas" num percurso plano.
 */
function elevationGainFromPoints(raw: RawTrack): number | null {
  const ele = raw.points.map((p) => p.ele).filter((e): e is number => e != null && Number.isFinite(e));
  if (ele.length < raw.points.length * 0.8 || ele.length < 10) return null;
  const r = 4;
  const smooth = ele.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - r); k <= Math.min(ele.length - 1, i + r); k++) {
      s += ele[k];
      n++;
    }
    return s / n;
  });
  let gain = 0;
  let ref = smooth[0];
  for (const e of smooth) {
    if (e > ref + 3) {
      gain += e - ref;
      ref = e;
    } else if (e < ref) {
      ref = e;
    }
  }
  return gain;
}
