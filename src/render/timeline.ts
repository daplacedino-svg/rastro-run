import { TIMELINE, VIDEO } from '../config';

export type Phase = 'intro' | 'run' | 'outro';

export interface TimelineInfo {
  totalFrames: number;
  introFrames: number;
  runFrames: number;
  outroFrames: number;
}

export function timelineInfo(durationSec: number): TimelineInfo {
  const totalFrames = Math.round(durationSec * VIDEO.fps);
  const introFrames = Math.round(TIMELINE.introSec * VIDEO.fps);
  const outroFrames = Math.round(TIMELINE.outroSec * VIDEO.fps);
  return { totalFrames, introFrames, outroFrames, runFrames: totalFrames - introFrames - outroFrames };
}

export function phaseOf(frame: number, t: TimelineInfo): { phase: Phase; phaseFrame: number } {
  if (frame < t.introFrames) return { phase: 'intro', phaseFrame: frame };
  if (frame < t.introFrames + t.runFrames) return { phase: 'run', phaseFrame: frame - t.introFrames };
  return { phase: 'outro', phaseFrame: frame - t.introFrames - t.runFrames };
}

/**
 * Fração do trajeto percorrida no quadro. Velocidade constante, com uma
 * aceleração curtinha no começo e uma freada no fim para não dar tranco.
 */
export function runFraction(frame: number, t: TimelineInfo): number {
  const { phase, phaseFrame } = phaseOf(frame, t);
  if (phase === 'intro') return 0;
  if (phase === 'outro') return 1;
  const u = phaseFrame / Math.max(1, t.runFrames - 1);
  return trapezoid(u, 0.05);
}

/** Perfil de velocidade trapezoidal: rampa `r` no início e no fim, constante no meio. */
function trapezoid(u: number, r: number): number {
  const vmax = 1 / (1 - r);
  if (u < r) return (vmax * u * u) / (2 * r);
  if (u > 1 - r) {
    const v = 1 - u;
    return 1 - (vmax * v * v) / (2 * r);
  }
  return vmax * (u - r / 2);
}

export const easeInOutCubic = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
export const easeOutCubic = (x: number): number => 1 - (1 - x) ** 3;
