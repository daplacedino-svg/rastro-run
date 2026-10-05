import type { Map as MlMap } from 'maplibre-gl';
import { CAMERA, CAMERA_PRESETS, MAP_CSS_HEIGHT, MAP_CSS_WIDTH, TIMELINE, VIDEO, type CameraPresetId } from '../config';
import { easeInOutCubic, phaseOf, runFraction, timelineInfo, type Phase, type TimelineInfo } from '../render/timeline';
import { angleDiff, bearing, fromMercator, metersPerMercatorUnit, toMercator, type LngLat } from '../track/geo';
import type { Route } from '../track/route';

export interface FramePose {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  /** desloca o ponto seguido para baixo do centro da tela (CSS px) */
  paddingTop: number;
  runner: LngLat;
  /** metros percorridos no trajeto suavizado */
  runnerDist: number;
  /** fração do trajeto revelada (0..1) */
  progress: number;
  phase: Phase;
  /** segundos desde o início da fase */
  phaseTime: number;
  /** para que lado o bonequinho olha na tela: 1 = direita, -1 = esquerda */
  facing: 1 | -1;
}

export interface CameraPath {
  frames: FramePose[];
  timeline: TimelineInfo;
  followZoom: number;
}

/**
 * Calcula a câmera de todos os quadros de uma vez. Tudo é determinístico,
 * então a prévia e o vídeo exportado mostram exatamente a mesma coisa.
 * `map` é usado só para medir o enquadramento final (zoom-out).
 */
export function buildCameraPath(route: Route, presetId: CameraPresetId, map: MlMap): CameraPath {
  const preset = CAMERA_PRESETS[presetId];
  const tl = timelineInfo();
  const n = tl.totalFrames;
  const fps = VIDEO.fps;
  const runSec = tl.runFrames / fps;

  // Onde o corredor está em cada quadro.
  const dist = new Float64Array(n);
  const runner: LngLat[] = [];
  for (let i = 0; i < n; i++) {
    dist[i] = runFraction(i, tl) * route.length;
    runner.push(route.pointAt(dist[i]));
  }

  // Zoom automático: trajetos longos ficam mais altos para o chão não passar rápido demais.
  const speed = route.length / runSec; // m por segundo de vídeo
  const targetMetersPerPx = speed / (CAMERA.screenWidthsPerSec * MAP_CSS_WIDTH);
  const midLat = route.pointAt(route.length / 2)[1];
  const followZoom = clamp(
    Math.log2(metersPerMercatorUnit(midLat) / (512 * targetMetersPerPx)),
    CAMERA.minZoom,
    CAMERA.maxZoom,
  );

  // Centro da câmera: caminho do corredor suavizado (ele fica "mais ou menos" no meio).
  const merc = runner.map(toMercator);
  const cx = gaussian(merc.map((m) => m[0]), preset.centerSmoothSec * fps);
  const cy = gaussian(merc.map((m) => m[1]), preset.centerSmoothSec * fps);

  // Rotação.
  const axis = principalAxisBearing(route);
  let followBearing: Float64Array;
  if (preset.bearingMode === 'fixed') {
    followBearing = new Float64Array(n).fill(axis);
  } else {
    const span = Math.max(30, speed * 0.8);
    const raw = new Float64Array(n);
    let prev = route.headingAt(0, span);
    for (let i = 0; i < n; i++) {
      // "desenrola" o ângulo para a suavização não dar a volta pelo lado errado em 180°/-180°
      prev = prev + angleDiff(prev, route.headingAt(dist[i], span));
      raw[i] = prev;
    }
    followBearing = gaussian(Array.from(raw), preset.bearingSmoothSec * fps);
  }

  const followPadding = 2 * CAMERA.followOffsetY * MAP_CSS_HEIGHT;
  const follow = (i: number): Omit<FramePose, 'runner' | 'runnerDist' | 'progress' | 'phase' | 'phaseTime' | 'facing'> => ({
    center: fromMercator([cx[i], cy[i]]),
    zoom: followZoom,
    pitch: CAMERA.pitch,
    bearing: followBearing[i],
    paddingTop: followPadding,
  });

  // Fechamento: visão geral com o eixo maior do trajeto na vertical (aproveita o 9:16).
  const lastFollowBearing = followBearing[tl.introFrames + tl.runFrames - 1];
  const overviewBearing =
    preset.bearingMode === 'fixed'
      ? axis
      : Math.abs(angleDiff(lastFollowBearing, axis)) <= 90
        ? lastFollowBearing + angleDiff(lastFollowBearing, axis)
        : lastFollowBearing + angleDiff(lastFollowBearing, axis + 180);
  const overview = fitOverview(map, route, overviewBearing, CAMERA.outroPitch);

  // Lado para onde o bonequinho olha: componente horizontal, na tela, da direção do trajeto.
  // Histerese para ele não ficar virando de um lado para o outro em trechos "para cima".
  const facingSpan = Math.max(20, speed * 0.4);
  const facing: (1 | -1)[] = [];
  let face: 1 | -1 = 1;
  const firstRun = tl.introFrames;
  const lastRun = tl.introFrames + tl.runFrames - 1;
  for (let i = 0; i < n; i++) {
    const j = clamp(i, firstRun, lastRun);
    const sx = Math.sin((route.headingAt(dist[j], facingSpan) - followBearing[j]) * (Math.PI / 180));
    if (i === 0) face = sx < 0 ? -1 : 1;
    else if (sx > 0.3) face = 1;
    else if (sx < -0.3) face = -1;
    facing.push(face);
  }

  const frames: FramePose[] = [];
  const outroMoveFrames = Math.round(TIMELINE.outroMoveSec * fps);
  const finishMerc = toMercator(route.end);

  for (let i = 0; i < n; i++) {
    const { phase, phaseFrame } = phaseOf(i, tl);
    let pose = follow(i);

    if (phase === 'intro') {
      const w = easeInOutCubic(phaseFrame / tl.introFrames);
      const start = follow(0);
      pose = {
        center: pose.center,
        zoom: lerp(start.zoom + CAMERA.introZoomDelta, pose.zoom, w),
        pitch: lerp(CAMERA.introPitch, pose.pitch, w),
        bearing: lerp(start.bearing + CAMERA.introBearingDelta, pose.bearing, w),
        paddingTop: lerp(0, pose.paddingTop, w),
      };
    } else if (phase === 'outro') {
      const w = easeInOutCubic(Math.min(1, phaseFrame / outroMoveFrames));
      const zoom = lerp(pose.zoom, overview.zoom, w);
      // Interpola o deslocamento do corredor *na tela*, não no chão: assim ele
      // desliza do meio até sua posição final sem escapar do quadro durante o zoom.
      const fromC = toMercator(pose.center);
      const toC = toMercator(overview.center);
      const k = 2 ** (overview.zoom - zoom);
      const offA: [number, number] = [fromC[0] - finishMerc[0], fromC[1] - finishMerc[1]];
      const offB: [number, number] = [(toC[0] - finishMerc[0]) * k, (toC[1] - finishMerc[1]) * k];
      const off: [number, number] = [lerp(offA[0] * 2 ** (pose.zoom - zoom), offB[0], w), lerp(offA[1] * 2 ** (pose.zoom - zoom), offB[1], w)];
      pose = {
        center: fromMercator([finishMerc[0] + off[0], finishMerc[1] + off[1]]),
        zoom,
        pitch: lerp(pose.pitch, overview.pitch, w),
        bearing: pose.bearing + angleDiff(pose.bearing, overview.bearing) * w,
        paddingTop: lerp(pose.paddingTop, 0, w),
      };
    }

    frames.push({
      ...pose,
      runner: runner[i],
      runnerDist: dist[i],
      progress: dist[i] / route.length,
      phase,
      phaseTime: phaseFrame / fps,
      facing: facing[i],
    });
  }

  return { frames, timeline: tl, followZoom };
}

export function applyPose(map: MlMap, pose: FramePose): void {
  map.jumpTo({
    center: pose.center,
    zoom: pose.zoom,
    pitch: pose.pitch,
    bearing: pose.bearing,
    padding: { top: pose.paddingTop, bottom: 0, left: 0, right: 0 },
  });
}

/** Eixo principal do trajeto (PCA), orientado do início para o "miolo" do percurso. */
function principalAxisBearing(route: Route): number {
  const pts = route.sample(200).map(toMercator);
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const axis = (Math.atan2(Math.cos(theta), -Math.sin(theta)) * 180) / Math.PI;
  const toward = bearing(route.start, fromMercator([mx, my]));
  return Math.abs(angleDiff(toward, axis)) <= 90 ? axis : axis + 180;
}

/**
 * Acha centro e zoom para o trajeto inteiro caber na tela já inclinada.
 * Usa o próprio MapLibre para projetar (leva em conta a perspectiva).
 */
function fitOverview(
  map: MlMap,
  route: Route,
  bearingDeg: number,
  pitch: number,
): { center: LngLat; zoom: number; bearing: number; pitch: number } {
  const saved = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    padding: map.getPadding(),
  };
  const pts = route.sample(300);
  const pad = CAMERA.outroPadding;
  const safe = {
    left: MAP_CSS_WIDTH * pad.side,
    right: MAP_CSS_WIDTH * (1 - pad.side),
    top: MAP_CSS_HEIGHT * pad.top,
    bottom: MAP_CSS_HEIGHT * (1 - pad.bottom),
  };
  const safeCx = (safe.left + safe.right) / 2;
  const safeCy = (safe.top + safe.bottom) / 2;

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  let center: LngLat = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  let zoom = 14;

  const measure = (c: LngLat, z: number) => {
    map.jumpTo({ center: c, zoom: z, bearing: bearingDeg, pitch, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      const s = map.project(p);
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y);
    }
    return { minX, maxX, minY, maxY };
  };

  for (let iter = 0; iter < 3; iter++) {
    // busca binária do maior zoom que cabe
    let lo = 3;
    let hi = Math.min(CAMERA.maxZoom, 18);
    for (let k = 0; k < 18; k++) {
      const mid = (lo + hi) / 2;
      const b = measure(center, mid);
      const fits = b.maxX - b.minX <= safe.right - safe.left && b.maxY - b.minY <= safe.bottom - safe.top;
      if (fits) lo = mid;
      else hi = mid;
    }
    zoom = lo;
    // recentraliza: leva o meio da caixa projetada para o meio da área segura
    const b = measure(center, zoom);
    const boxCx = (b.minX + b.maxX) / 2;
    const boxCy = (b.minY + b.maxY) / 2;
    const shifted = map.unproject([MAP_CSS_WIDTH / 2 + (boxCx - safeCx), MAP_CSS_HEIGHT / 2 + (boxCy - safeCy)]);
    center = [shifted.lng, shifted.lat];
  }

  map.jumpTo(saved);
  return { center, zoom, bearing: bearingDeg, pitch };
}

function gaussian(values: number[], sigma: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (sigma < 0.5) {
    out.set(values);
    return out;
  }
  const radius = Math.ceil(sigma * 3);
  const kernel: number[] = [];
  for (let k = -radius; k <= radius; k++) kernel.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let wsum = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k)); // bordas "esticadas"
      const w = kernel[k + radius];
      acc += values[j] * w;
      wsum += w;
    }
    out[i] = acc / wsum;
  }
  return out;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
