import { STYLE } from '../config';

const kmFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatKm(meters: number): string {
  return `${kmFormat.format(Math.floor(meters / 100) / 10)} km`;
}

/** Etiqueta arredondada com o km, centralizada em (x, bottomY). */
export function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, bottomY: number, scale = 1): void {
  const fontPx = 42 * scale;
  ctx.save();
  ctx.font = `800 ${fontPx}px ${STYLE.font}`;
  const w = ctx.measureText(text).width + 40 * scale;
  const h = fontPx + 26 * scale;
  const left = x - w / 2;
  const top = bottomY - h;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 16 * scale;
  ctx.shadowOffsetY = 4 * scale;
  ctx.fillStyle = STYLE.pillBg;
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, h / 2);
  ctx.fill();
  // biquinho apontando para o corredor
  ctx.beginPath();
  ctx.moveTo(x - 12 * scale, bottomY - 1);
  ctx.lineTo(x, bottomY + 12 * scale);
  ctx.lineTo(x + 12 * scale, bottomY - 1);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = STYLE.pillText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, top + h / 2 + 2 * scale);
  ctx.restore();
}

export function drawCredit(ctx: CanvasRenderingContext2D, text: string, width: number, height: number): void {
  ctx.save();
  ctx.font = `500 22px ${STYLE.font}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 4;
  ctx.fillText(text, width - 24, height - 20);
  ctx.restore();
}

// ---- confete da comemoração (determinístico: mesmo resultado na prévia e no vídeo) ----

interface Particle {
  vx: number;
  vy: number;
  size: number;
  spin: number;
  color: string;
  delay: number;
}

const CONFETTI_COLORS = ['#ff5a1f', '#ffd23f', '#3ec1ff', '#ffffff', '#7cf29c', '#ff7eb6'];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const particles: Particle[] = (() => {
  const rnd = mulberry32(42);
  return Array.from({ length: 110 }, () => {
    const angle = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
    const speed = 700 + rnd() * 900;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 10 + rnd() * 12,
      spin: (rnd() - 0.5) * 18,
      color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)],
      delay: rnd() * 0.25,
    };
  });
})();

/** Explosão de confete saindo de (x, y), `t` segundos depois de começar. */
export function drawConfetti(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  if (t <= 0) return;
  const g = 1500;
  const drag = 1.6;
  ctx.save();
  for (const p of particles) {
    const tt = t - p.delay;
    if (tt <= 0) continue;
    // movimento com arrasto do ar (exponencial) + gravidade
    const k = (1 - Math.exp(-drag * tt)) / drag;
    const px = x + p.vx * k;
    const py = y + p.vy * k + 0.5 * g * tt * tt * 0.35;
    const alpha = Math.max(0, Math.min(1, 2.6 - tt));
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.translate(px, py);
    ctx.rotate(p.spin * tt);
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
}
