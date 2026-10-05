/** Cronômetro da geração, com marcas por etapa (mapas, vídeo…). */
export class Stopwatch {
  private t0 = 0;
  private timer = 0;
  private lastLap = 0;
  readonly laps: { name: string; ms: number }[] = [];
  elapsedMs = 0;

  constructor(private readonly el: HTMLElement) {}

  start(): void {
    this.t0 = performance.now();
    this.lastLap = this.t0;
    this.laps.length = 0;
    this.elapsedMs = 0;
    this.render();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.render(), 100);
  }

  lap(name: string): void {
    const now = performance.now();
    this.laps.push({ name, ms: now - this.lastLap });
    this.lastLap = now;
  }

  stop(): number {
    clearInterval(this.timer);
    this.render();
    return this.elapsedMs;
  }

  private render(): void {
    this.elapsedMs = performance.now() - this.t0;
    this.el.textContent = formatDuration(this.elapsedMs);
  }
}

/** 83456 ms → "01:23,4" */
export function formatDuration(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const min = Math.floor(totalTenths / 600);
  const sec = Math.floor((totalTenths % 600) / 10);
  const tenth = totalTenths % 10;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${tenth}`;
}

export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}
