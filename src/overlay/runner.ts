import { STYLE, VIDEO } from '../config';

// Bonequinho original desenhado em SVG por cinemática simples (quadril → joelho → pé,
// ombro → cotovelo → mão). Cada pose vira um SVG e é rasterizada uma vez só.

interface Pose {
  /** inclinação do tronco para frente (graus) */
  lean: number;
  /** deslocamento vertical do corpo (unidades do viewBox; negativo = para cima) */
  lift: number;
  /** [perna de trás, perna da frente]: coxa (0 = para baixo, + = para frente) e dobra do joelho */
  thigh: [number, number];
  knee: [number, number];
  /** [braço de trás, braço da frente]: ombro e dobra do cotovelo */
  arm: [number, number];
  elbow: [number, number];
}

const VB = { x: 0, y: -24, w: 120, h: 184 };
const HIP = { x: 58, y: 84 };
const GROUND_Y = 140;
const L = { torso: 34, thigh: 27, shin: 27, upper: 18, fore: 17, head: 11 };
/** altura útil da figura em unidades do viewBox (cabeça até o pé, parado) */
const FIGURE_UNITS = 116;

const rad = Math.PI / 180;
const dir = (a: number): [number, number] => [Math.sin(a * rad), Math.cos(a * rad)];

function poseSvg(p: Pose): string {
  const hip = { x: HIP.x, y: HIP.y + p.lift };
  const [lx, ly] = dir(180 - p.lean);
  const shoulder = { x: hip.x + lx * L.torso, y: hip.y + ly * L.torso };
  const head = { x: shoulder.x + lx * (L.head + 5) + 1.5, y: shoulder.y + ly * (L.head + 5) };

  const limb = (from: { x: number; y: number }, a1: number, l1: number, a2: number, l2: number) => {
    const [d1x, d1y] = dir(a1);
    const mid = { x: from.x + d1x * l1, y: from.y + d1y * l1 };
    const [d2x, d2y] = dir(a2);
    const end = { x: mid.x + d2x * l2, y: mid.y + d2y * l2 };
    return `M${from.x.toFixed(2)} ${from.y.toFixed(2)}L${mid.x.toFixed(2)} ${mid.y.toFixed(2)}L${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const leg = (i: 0 | 1) => limb(hip, p.thigh[i], L.thigh, p.thigh[i] - p.knee[i], L.shin);
  const arm = (i: 0 | 1) => limb(shoulder, p.arm[i], L.upper, p.arm[i] + p.elbow[i], L.fore);
  const torso = `M${hip.x.toFixed(2)} ${hip.y.toFixed(2)}L${shoulder.x.toFixed(2)} ${shoulder.y.toFixed(2)}`;

  const stroke = (d: string, color: string, w: number) =>
    `<path d="${d}" fill="none" stroke="${STYLE.runnerOutline}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  const parts = [
    stroke(arm(0), STYLE.runnerShade, 9),
    stroke(leg(0), STYLE.runnerShade, 10.5),
    stroke(torso, STYLE.runnerColor, 14),
    stroke(leg(1), STYLE.runnerColor, 10.5),
    `<circle cx="${head.x.toFixed(2)}" cy="${head.y.toFixed(2)}" r="${L.head}" fill="${STYLE.runnerColor}" stroke="${STYLE.runnerOutline}" stroke-width="3"/>`,
    stroke(arm(1), STYLE.runnerColor, 9),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}">${parts.join('')}</svg>`;
}

function runPose(phase: number): Pose {
  const t = phase * 2 * Math.PI;
  const s = Math.sin(t);
  // joelho dobra mais quando a perna está voltando para frente (fase aérea)
  const flex = (o: number) => 18 + 78 * Math.max(0, Math.cos(t + o - 0.5)) ** 1.4;
  return {
    lean: 11,
    lift: -3.5 * Math.abs(Math.cos(t)),
    thigh: [8 - 36 * s, 8 + 36 * s],
    knee: [flex(Math.PI), flex(0)],
    arm: [38 * s - 4, -38 * s - 4],
    elbow: [95, 95],
  };
}

function celebratePose(phase: number): Pose {
  const t = phase * 2 * Math.PI;
  const h = Math.sin(phase * Math.PI) ** 2; // 0 no chão, 1 no alto do pulo
  const wave = Math.sin(t * 2);
  return {
    lean: -2,
    lift: -20 * h,
    thigh: [-6 + 30 * h, 10 + 34 * h],
    knee: [6 + 70 * h, 6 + 80 * h],
    arm: [-150 + 12 * wave, 158 - 12 * wave],
    elbow: [-18, 18],
  };
}

function standPose(phase: number): Pose {
  const breathe = Math.sin(phase * 2 * Math.PI);
  return {
    lean: 3,
    lift: -0.8 * breathe,
    thigh: [-4, 5],
    knee: [5, 5],
    arm: [-14, 16 + breathe * 2],
    elbow: [30, 40],
  };
}

export interface RunnerSprites {
  run: ImageBitmap[];
  celebrate: ImageBitmap[];
  stand: ImageBitmap[];
  width: number;
  height: number;
  /** ponto do sprite que encosta no chão (px) */
  anchorX: number;
  anchorY: number;
  /** distância do chão até o topo da cabeça parado (px) */
  standingHeight: number;
}

async function rasterize(svg: string, w: number, h: number): Promise<ImageBitmap> {
  const img = new Image(w, h);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return createImageBitmap(canvas);
}

export async function loadRunnerSprites(frameCount = 16): Promise<RunnerSprites> {
  const scale = (STYLE.runnerHeightPx * (VIDEO.width / 1080)) / FIGURE_UNITS;
  const width = Math.round(VB.w * scale);
  const height = Math.round(VB.h * scale);
  const build = (fn: (ph: number) => Pose) =>
    Promise.all(Array.from({ length: frameCount }, (_, i) => rasterize(poseSvg(fn(i / frameCount)), width, height)));
  const [run, celebrate, stand] = await Promise.all([build(runPose), build(celebratePose), build(standPose)]);
  return {
    run,
    celebrate,
    stand,
    width,
    height,
    anchorX: (HIP.x - VB.x) * scale,
    anchorY: (GROUND_Y - VB.y) * scale,
    standingHeight: FIGURE_UNITS * scale,
  };
}

/** Para debug: SVG de uma pose do ciclo de corrida. */
export function runnerSvg(kind: 'run' | 'celebrate' | 'stand', phase: number): string {
  const fn = kind === 'run' ? runPose : kind === 'celebrate' ? celebratePose : standPose;
  return poseSvg(fn(phase));
}
