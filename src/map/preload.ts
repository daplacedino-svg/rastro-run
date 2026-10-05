import type { Map as MlMap } from 'maplibre-gl';
import { PRELOAD_EVERY_N_FRAMES } from '../config';
import { applyPose, type CameraPath } from './camera';
import { prefetchTiles } from './tile-cache';
import type { TileSource } from './tile-sources';

/**
 * Lista todos os tiles que a câmera vai precisar ao longo do vídeo.
 * Só move a câmera (sem desenhar), então é rápido.
 */
export function collectTileUrls(map: MlMap, path: CameraPath, source: TileSource): string[] {
  const saved = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    padding: map.getPadding(),
  };
  const template = source.tiles[0];
  const urls = new Set<string>();
  const n = path.frames.length;
  for (let i = 0; i < n; i += PRELOAD_EVERY_N_FRAMES) visit(i);
  visit(n - 1);
  map.jumpTo(saved);
  return [...urls];

  function visit(i: number) {
    applyPose(map, path.frames[i]);
    const tiles = map.coveringTiles({ tileSize: source.tileSize, maxzoom: source.maxzoom, roundZoom: true });
    for (const t of tiles) {
      const { z, x, y } = t.canonical;
      urls.add(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    }
  }
}

export async function preloadTiles(
  map: MlMap,
  path: CameraPath,
  source: TileSource,
  onProgress: (fraction: number, done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ total: number; failed: number }> {
  const urls = collectTileUrls(map, path, source);
  const { failed } = await prefetchTiles(urls, (done, total) => onProgress(done / total, done, total), signal);
  return { total: urls.length, failed };
}
