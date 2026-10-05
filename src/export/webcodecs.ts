import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from 'mediabunny';
import { VIDEO } from '../config';
import { renderFrameExact, type Scene } from '../render/scene';
import type { ExportProgress } from './types';

export async function webCodecsSupported(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    return await canEncodeVideo('avc', { width: VIDEO.width, height: VIDEO.height, bitrate: VIDEO.bitrate });
  } catch {
    return false;
  }
}

/**
 * Gera o MP4 quadro a quadro. Não é em tempo real: cada quadro espera os tiles
 * e o encoder, então o vídeo sai liso mesmo num celular lento (só demora mais).
 */
export async function exportWithWebCodecs(
  scene: Scene,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(scene.compositor.canvas, {
    codec: 'avc',
    bitrate: VIDEO.bitrate,
    keyFrameInterval: 2,
    latencyMode: 'quality',
  });
  output.addVideoTrack(source, { frameRate: VIDEO.fps });
  await output.start();

  const total = scene.path.frames.length;
  try {
    for (let i = 0; i < total; i++) {
      signal.throwIfAborted();
      await renderFrameExact(scene, i);
      await source.add(i / VIDEO.fps, 1 / VIDEO.fps);
      onProgress({ frame: i + 1, total });
    }
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error('O encoder não produziu nenhum dado.');
  return new Blob([buffer], { type: 'video/mp4' });
}
