import type { Map as MlMap } from 'maplibre-gl';
import { MAP_PIXEL_RATIO, STYLE, VIDEO } from '../config';
import type { CameraPath } from '../map/camera';
import { drawConfetti, drawCredit, drawPill, formatKm } from '../overlay/hud';
import type { RunnerSprites } from '../overlay/runner';
import type { Route } from '../track/route';

/** Junta mapa + bonequinho + km num canvas 1080×1920 (o que vai para o vídeo). */
export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(
    private readonly map: MlMap,
    private readonly sprites: RunnerSprites,
    private readonly credit: string,
    canvas?: HTMLCanvasElement,
  ) {
    this.canvas = canvas ?? document.createElement('canvas');
    this.canvas.width = VIDEO.width;
    this.canvas.height = VIDEO.height;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
  }

  /** Desenha o quadro `i`. O mapa já precisa estar na pose desse quadro. */
  draw(path: CameraPath, route: Route, i: number): void {
    const { ctx, sprites } = this;
    const pose = path.frames[i];
    const W = VIDEO.width;
    const H = VIDEO.height;

    ctx.drawImage(this.map.getCanvas(), 0, 0, W, H);

    const p = this.map.project(pose.runner);
    const x = p.x * MAP_PIXEL_RATIO;
    const y = p.y * MAP_PIXEL_RATIO;

    let frames = sprites.run;
    let cycle = 0;
    let jump = 0;
    if (pose.phase === 'intro') {
      frames = sprites.stand;
      cycle = pose.phaseTime / 1.6;
    } else if (pose.phase === 'run') {
      cycle = pose.phaseTime * STYLE.strideHz;
    } else {
      frames = sprites.celebrate;
      cycle = pose.phaseTime / 0.85;
      jump = Math.sin((cycle % 1) * Math.PI) ** 2;
    }
    const sprite = frames[Math.floor((cycle % 1) * frames.length) % frames.length];

    // sombra no chão
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.38 - jump * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(x, y, sprites.width * 0.26 * (1 - jump * 0.3), sprites.width * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (pose.phase === 'outro') drawConfetti(ctx, x, y - sprites.standingHeight * 0.6, pose.phaseTime - 0.15);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pose.facing, 1);
    ctx.drawImage(sprite, -sprites.anchorX, -sprites.anchorY, sprites.width, sprites.height);
    ctx.restore();

    const km = formatKm((pose.runnerDist / route.length) * route.displayDistance);
    const pillGap = pose.phase === 'outro' ? 70 : 34;
    drawPill(ctx, km, x, y - sprites.standingHeight - pillGap, pose.phase === 'outro' ? 1.25 : 1);

    drawCredit(ctx, this.credit, W, H);
  }
}
