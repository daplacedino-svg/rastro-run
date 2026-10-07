import { VIDEO } from '../config';
import { renderFrameFast, type Scene } from './scene';

/** Prévia em tempo real, desenhada no mesmo canvas que vai para o vídeo. */
export class Preview {
  private scene: Scene | null = null;
  private frame = 0;
  private playing = false;
  private raf = 0;
  private startedAt = 0;
  private suspended = false;

  constructor(private readonly onFrame: (frame: number, total: number, playing: boolean) => void) {}

  private boundMaps = new WeakSet<object>();
  private drawing = false;

  setScene(scene: Scene): void {
    this.pause();
    this.scene = scene;
    const map = scene.rmap.map;
    if (!this.boundMaps.has(map)) {
      this.boundMaps.add(map);
      // Com a prévia parada, tiles que chegam depois fazem o MapLibre redesenhar sozinho;
      // aproveita esse render para atualizar o canvas da prévia.
      map.on('render', () => {
        const s = this.scene;
        if (!s || s.rmap.map !== map || this.playing || this.suspended || this.drawing) return;
        s.compositor.draw(s.path, s.route, this.frame, s.stats);
      });
    }
    this.show(0);
  }

  get total(): number {
    return this.scene?.path.frames.length ?? 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  show(frame: number): void {
    if (!this.scene || this.suspended) return;
    this.frame = Math.max(0, Math.min(this.total - 1, frame));
    this.drawing = true;
    try {
      renderFrameFast(this.scene, this.frame);
    } finally {
      this.drawing = false;
    }
    this.onFrame(this.frame, this.total, this.playing);
  }

  play(): void {
    if (!this.scene || this.playing || this.suspended) return;
    if (this.frame >= this.total - 1) this.frame = 0;
    this.playing = true;
    this.startedAt = performance.now() - (this.frame / VIDEO.fps) * 1000;
    const tick = () => {
      if (!this.playing) return;
      const f = Math.floor(((performance.now() - this.startedAt) / 1000) * VIDEO.fps);
      if (f >= this.total) {
        this.playing = false;
        this.show(this.total - 1);
        return;
      }
      this.show(f);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.onFrame(this.frame, this.total, true);
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (this.scene) this.onFrame(this.frame, this.total, false);
  }

  /** A exportação assume o mapa; a prévia fica congelada até `resume`. */
  suspend(): void {
    this.pause();
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
    this.show(this.frame);
  }
}
