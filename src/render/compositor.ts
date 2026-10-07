import type { Map as MlMap } from 'maplibre-gl';
import { MAP_CSS_HEIGHT, MAP_PIXEL_RATIO, STYLE, VIDEO } from '../config';
import { toMercator, type LngLat } from '../track/geo';
import type { CameraPath } from '../map/camera';
import { drawConfetti, drawCredit, drawPill, formatKm } from '../overlay/hud';
import type { RunnerSprites } from '../overlay/runner';
import { drawEndCard, endCardProgress } from '../overlay/end-card';
import type { Route } from '../track/route';
import type { RunStats } from '../track/stats';

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
  draw(path: CameraPath, route: Route, i: number, stats?: RunStats): void {
    const { ctx, sprites } = this;
    const pose = path.frames[i];
    const W = VIDEO.width;
    const H = VIDEO.height;

    ctx.drawImage(this.map.getCanvas(), 0, 0, W, H);
    this.drawRoute(route, pose.runnerDist);
    // cartão de dados fica abaixo do bonequinho e do confete
    if (stats && pose.phase === 'outro') drawEndCard(ctx, stats, pose.phaseTime, W, H);

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
    // no fechamento a etiqueta some enquanto o cartão de dados (com a distância exata) entra
    const pillAlpha = pose.phase === 'outro' && stats ? 1 - endCardProgress(pose.phaseTime) : 1;
    if (pillAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = pillAlpha;
      drawPill(ctx, km, x, y - sprites.standingHeight - pillGap, pose.phase === 'outro' ? 1.25 : 1);
      ctx.restore();
    }

    drawCredit(ctx, this.credit, W, H);
  }

  /**
   * Rastro percorrido até `upTo` metros, projetado na tela com a perspectiva do mapa.
   * Com a câmera inclinada, parte do caminho já percorrido fica atrás da câmera; esses
   * trechos são cortados num plano logo à frente dela (senão a projeção sai espelhada).
   */
  private drawRoute(route: Route, upTo: number): void {
    if (upTo <= 0) return;
    const { ctx, map } = this;
    const { coords, cum } = route.drawPath;

    // Câmera (em unidades Mercator), reconstruída como o MapLibre faz.
    const zoom = map.getZoom();
    const pitch = map.getPitch() * DEG;
    const bearing = map.getBearing() * DEG;
    const worldSize = 512 * 2 ** zoom;
    const camDist = MAP_CSS_HEIGHT / 2 / Math.tan(FOV / 2) / worldSize;
    const [cx, cy] = toMercator([map.getCenter().lng, map.getCenter().lat]);
    const hx = Math.sin(bearing);
    const hy = -Math.cos(bearing);
    const camX = cx - hx * camDist * Math.sin(pitch);
    const camY = cy - hy * camDist * Math.sin(pitch);
    const groundTerm = camDist * Math.cos(pitch) ** 2;
    const depth = (m: [number, number]) => ((m[0] - camX) * hx + (m[1] - camY) * hy) * Math.sin(pitch) + groundTerm;
    const near = camDist * 0.15;

    ctx.beginPath();
    let prev: LngLat | null = null;
    let prevDepth = 0;
    let penDown = false;
    const visit = (c: LngLat) => {
      const d = depth(toMercator(c));
      if (prev) {
        if (prevDepth >= near && d >= near) {
          if (!penDown) moveTo(prev);
          lineTo(c);
          penDown = true;
        } else if (prevDepth >= near || d >= near) {
          // segmento cruza o plano de corte: vai só até a interseção
          const t = (near - prevDepth) / (d - prevDepth);
          const cut: LngLat = [prev[0] + (c[0] - prev[0]) * t, prev[1] + (c[1] - prev[1]) * t];
          if (prevDepth >= near) {
            if (!penDown) moveTo(prev);
            lineTo(cut);
            penDown = false;
          } else {
            moveTo(cut);
            lineTo(c);
            penDown = true;
          }
        } else {
          penDown = false;
        }
      }
      prev = c;
      prevDepth = d;
    };
    const moveTo = (c: LngLat) => {
      const s = map.project(c);
      ctx.moveTo(s.x * MAP_PIXEL_RATIO, s.y * MAP_PIXEL_RATIO);
    };
    const lineTo = (c: LngLat) => {
      const s = map.project(c);
      ctx.lineTo(s.x * MAP_PIXEL_RATIO, s.y * MAP_PIXEL_RATIO);
    };

    for (let k = 0; k < coords.length && cum[k] < upTo; k++) visit(coords[k]);
    visit(route.pointAt(upTo));

    const w = STYLE.routeWidth * MAP_PIXEL_RATIO;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = STYLE.routeColor;
    ctx.lineWidth = w * 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = STYLE.routeCasing;
    ctx.lineWidth = w + 8;
    ctx.stroke();
    ctx.strokeStyle = STYLE.routeColor;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.restore();
  }
}

const DEG = Math.PI / 180;
/** campo de visão vertical padrão do MapLibre */
const FOV = 36.87 * DEG;
