import type { Scene } from '../render/scene';
import { exportWithMediaRecorder, mediaRecorderMime } from './media-recorder';
import type { ExportMethod, ExportProgress, ExportResult } from './types';
import { exportWithWebCodecs, webCodecsSupported } from './webcodecs';

export type { ExportMethod, ExportProgress, ExportResult } from './types';

/** WebCodecs quando dá (MP4 H.264, quadro a quadro); senão MediaRecorder em tempo real. */
export async function pickExportMethod(forced?: ExportMethod | null): Promise<ExportMethod | null> {
  if (forced === 'mediarecorder') return mediaRecorderMime() ? 'mediarecorder' : null;
  if (await webCodecsSupported()) return 'webcodecs';
  return mediaRecorderMime() ? 'mediarecorder' : null;
}

export async function exportVideo(
  scene: Scene,
  method: ExportMethod,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  if (method === 'webcodecs') {
    const blob = await exportWithWebCodecs(scene, onProgress, signal);
    return { blob, method, extension: 'mp4' };
  }
  const { blob, mime } = await exportWithMediaRecorder(scene, onProgress, signal);
  return { blob, method, extension: mime.includes('mp4') ? 'mp4' : 'webm' };
}
