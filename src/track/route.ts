import type { RawTrack } from '../parsers';
import { bearing, haversine, type LngLat } from './geo';

/** Trajeto limpo e suavizado, pronto para animar a velocidade constante. */
export class Route {
  readonly coords: LngLat[];
  /** distância acumulada (m) ao longo de `coords` */
  readonly cum: Float64Array;
  /** comprimento geométrico do trajeto suavizado (m) */
  readonly length: number;
  /** distância exibida no contador (m) — a do relógio quando o arquivo informa */
  readonly displayDistance: number;
  readonly name?: string;

  constructor(raw: RawTrack) {
    const rawCoords = raw.points.map((p): LngLat => [p.lon, p.lat]);
    const rawLength = pathLength(rawCoords);
    this.coords = smooth(dedupe(rawCoords, 1.5), 2);
    this.cum = cumulative(this.coords);
    this.length = this.cum[this.cum.length - 1];
    const reported = raw.reportedDistance;
    this.displayDistance = reported && reported > 0 ? reported : rawLength;
    this.name = raw.name;
  }

  get start(): LngLat {
    return this.coords[0];
  }

  get end(): LngLat {
    return this.coords[this.coords.length - 1];
  }

  /** Posição a `d` metros do início (interpolada). */
  pointAt(d: number): LngLat {
    const { coords, cum } = this;
    if (d <= 0) return coords[0];
    if (d >= this.length) return coords[coords.length - 1];
    let lo = 0;
    let hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    const t = seg > 0 ? (d - cum[lo]) / seg : 0;
    const a = coords[lo];
    const b = coords[hi];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  /** Direção do trajeto em `d`, olhando `span` metros para trás e para frente. */
  headingAt(d: number, span: number): number {
    let a = Math.max(0, d - span);
    let b = Math.min(this.length, d + span);
    // nas pontas, mantém a janela inteira para não ficar com um segmento minúsculo
    if (b - a < span) {
      if (a === 0) b = Math.min(this.length, 2 * span);
      else a = Math.max(0, this.length - 2 * span);
    }
    return bearing(this.pointAt(a), this.pointAt(b));
  }

  private _drawPath?: { coords: LngLat[]; cum: Float64Array };

  /**
   * Versão do trajeto para desenhar a linha a cada quadro: pontos a cada poucos metros,
   * limitada a ~3000 pontos para uma maratona gravada a 1 Hz não pesar no render.
   */
  get drawPath(): { coords: LngLat[]; cum: Float64Array } {
    if (!this._drawPath) {
      const n = Math.max(2, Math.min(3000, Math.ceil(this.length / 4)) + 1);
      const coords = this.sample(n);
      const cum = new Float64Array(n);
      for (let i = 0; i < n; i++) cum[i] = (this.length * i) / (n - 1);
      this._drawPath = { coords, cum };
    }
    return this._drawPath;
  }

  /** Amostra o trajeto em `n` pontos igualmente espaçados. */
  sample(n: number): LngLat[] {
    const out: LngLat[] = [];
    for (let i = 0; i < n; i++) out.push(this.pointAt((this.length * i) / (n - 1)));
    return out;
  }
}

function pathLength(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

function cumulative(coords: LngLat[]): Float64Array {
  const cum = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + haversine(coords[i - 1], coords[i]);
  return cum;
}

/** Remove pontos parados (relógio gravando sem sair do lugar). */
function dedupe(coords: LngLat[], minMeters: number): LngLat[] {
  const out: LngLat[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (haversine(out[out.length - 1], coords[i]) >= minMeters) out.push(coords[i]);
  }
  if (out.length < 2) out.push(coords[coords.length - 1]);
  return out;
}

/** Média móvel simples para tirar o tremido do GPS, preservando as pontas. */
function smooth(coords: LngLat[], radius: number): LngLat[] {
  const n = coords.length;
  return coords.map((c, i) => {
    if (i === 0 || i === n - 1) return c;
    const r = Math.min(radius, i, n - 1 - i);
    let x = 0;
    let y = 0;
    for (let k = i - r; k <= i + r; k++) {
      x += coords[k][0];
      y += coords[k][1];
    }
    const m = 2 * r + 1;
    return [x / m, y / m];
  });
}
