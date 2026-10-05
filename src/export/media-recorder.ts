import { VIDEO } from '../config';
import { renderFrameFast, type Scene } from '../render/scene';
import type { ExportProgress } from './types';

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function mediaRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/**
 * Fallback: grava o canvas em tempo real. Depende dos tiles já estarem em memória
 * (pré-carregamento), porque aqui não dá para esperar a rede no meio do quadro.
 */
export async function exportWithMediaRecorder(
  scene: Scene,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<{ blob: Blob; mime: string }> {
  const mime = mediaRecorderMime();
  if (!mime) throw new Error('Este navegador não consegue gravar vídeo.');

  const canvas = scene.compositor.canvas;
  const stream = canvas.captureStream(VIDEO.fps);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO.bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  const total = scene.path.frames.length;
  renderFrameFast(scene, 0);
  recorder.start(1000);
  const t0 = performance.now();

  // Relógio com setTimeout em vez de requestAnimationFrame: a gravação não depende
  // da tela estar sendo redesenhada (o rAF para quando a página não está visível).
  const frameMs = 1000 / VIDEO.fps;
  await new Promise<void>((resolve, reject) => {
    let last = -1;
    const tick = () => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const elapsed = performance.now() - t0;
      const f = Math.floor((elapsed / 1000) * VIDEO.fps);
      if (f >= total) {
        resolve();
        return;
      }
      if (f !== last) {
        last = f;
        renderFrameFast(scene, f);
        onProgress({ frame: f + 1, total });
      }
      setTimeout(tick, Math.max(0, (f + 1) * frameMs - (performance.now() - t0)));
    };
    tick();
  }).finally(() => {
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  });

  await stopped;
  return { blob: new Blob(chunks, { type: recorder.mimeType || mime }), mime: recorder.mimeType || mime };
}
