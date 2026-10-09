import { END_CARD, STYLE } from '../config';
import type { RunStats } from '../track/stats';
import { drawBrand } from './hud';

// Cartão com os números da corrida, que sobe junto com a comemoração no fechamento.

const dateFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const num1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Cell {
  label: string;
  value: string;
  unit: string;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;

/** Quanto o cartão já entrou (0..1), `t` segundos depois do início do fechamento. */
export function endCardProgress(t: number): number {
  return easeOut(clamp01((t - END_CARD.appearAtSec) / END_CARD.appearDurSec));
}

/** `t` = segundos desde o início do fechamento. */
export function drawEndCard(ctx: CanvasRenderingContext2D, stats: RunStats, t: number, W: number, H: number): void {
  const enter = endCardProgress(t);
  if (enter <= 0) return;
  const count = easeOut(clamp01((t - END_CARD.appearAtSec) / END_CARD.countDurSec));

  const cells = buildCells(stats, count);
  const cols = cells.length <= 3 ? cells.length : 2;
  const rows = Math.ceil(cells.length / cols);

  const pad = 42;
  const titleSize = 50;
  const dateSize = 30;
  const labelSize = 25;
  const valueSize = 72;
  const rowH = labelSize + 12 + valueSize;
  const rowGap = 34;
  const hasDate = stats.startTime != null;
  const headerH = titleSize + (hasDate ? 14 + dateSize : 0);
  const headerGap = 32;
  const footerSize = 28;
  const footerGap = 30;
  const cardW = W - 2 * 56;
  const cardH = pad + headerH + headerGap + rows * rowH + (rows - 1) * rowGap + footerGap + footerSize + pad;
  const x = (W - cardW) / 2;
  const bottom = H * END_CARD.bottomFraction;
  const y = bottom - cardH + (1 - enter) * 70;

  ctx.save();
  ctx.globalAlpha = enter;

  // fundo
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = 'rgba(12, 16, 26, 0.86)';
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, cardH, 44);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // cabeçalho
  let cy = y + pad;
  ctx.fillStyle = STYLE.routeColor;
  ctx.beginPath();
  ctx.roundRect(x + pad, cy + 4, 10, titleSize - 8, 5);
  ctx.fill();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${titleSize}px ${STYLE.font}`;
  ctx.fillText(fit(ctx, stats.title, cardW - 2 * pad - 30), x + pad + 30, cy);
  cy += titleSize;
  if (hasDate) {
    cy += 14;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `500 ${dateSize}px ${STYLE.font}`;
    ctx.fillText(capitalize(dateFormat.format(stats.startTime!)), x + pad + 30, cy);
    cy += dateSize;
  }
  cy += headerGap;

  // números
  const colW = (cardW - 2 * pad) / cols;
  cells.forEach((cell, i) => {
    const cx = x + pad + (i % cols) * colW;
    const ry = cy + Math.floor(i / cols) * (rowH + rowGap);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `700 ${labelSize}px ${STYLE.font}`;
    ctx.fillText(cell.label.toUpperCase(), cx, ry);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${valueSize}px ${STYLE.font}`;
    ctx.fillText(cell.value, cx, ry + labelSize + 12);
    if (cell.unit) {
      const vw = ctx.measureText(cell.value).width;
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = `700 ${Math.round(valueSize * 0.46)}px ${STYLE.font}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(cell.unit, cx + vw + 10, ry + labelSize + 12 + valueSize * 0.86);
      ctx.textBaseline = 'top';
    }
  });

  // rodapé: "feito com rodagem.run"
  const footY = cy + rows * rowH + (rows - 1) * rowGap + footerGap + footerSize;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 ${footerSize}px ${STYLE.font}`;
  const prefix = 'feito com ';
  ctx.fillText(prefix, x + pad, footY);
  drawBrand(ctx, x + pad + ctx.measureText(prefix).width, footY, footerSize);

  ctx.restore();
}

function buildCells(s: RunStats, c: number): Cell[] {
  const cells: Cell[] = [{ label: 'Distância', value: num1.format((s.distance / 1000) * c), unit: 'km' }];
  if (s.movingTime != null) cells.push({ label: 'Tempo', value: clock(s.movingTime * c), unit: '' });
  if (s.pace != null) cells.push({ label: 'Pace médio', value: clock(s.pace * c), unit: '/km' });
  if (s.elevationGain != null) cells.push({ label: 'Elevação', value: String(Math.round(s.elevationGain * c)), unit: 'm' });
  return cells;
}

/** 2329 → "38:49"; 4931 → "1:22:11" */
function clock(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
