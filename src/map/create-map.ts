import { Map as MlMap, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// O MapLibre 6 carrega o worker por URL relativa ao próprio módulo, o que não sobrevive ao
// bundle do Vite. Empacotamos o worker (com as dependências dele) e passamos a URL explícita.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);
import { MAP_PIXEL_RATIO } from '../config';
import { registerTileCache, toCachedUrl } from './tile-cache';
import type { TileSource } from './tile-sources';

// O mapa só tem o satélite. O rastro é desenhado pelo compositor (src/render/compositor.ts):
// revelar a linha dentro do MapLibre obrigava a reprocessar o trajeto inteiro a cada quadro.

function buildStyle(source: TileSource): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: source.tiles.map(toCachedUrl),
        tileSize: source.tileSize,
        maxzoom: source.maxzoom,
        attribution: source.attribution,
      },
    },
    sky: {
      'sky-color': '#8db8e6',
      'horizon-color': '#dfe9f2',
      'fog-color': '#dfe9f2',
      'sky-horizon-blend': 0.7,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.9,
      'atmosphere-blend': 0,
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#1b2430' } },
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        // sem fade: cada quadro gravado precisa estar 100% pronto
        paint: { 'raster-fade-duration': 0 },
      },
    ],
  };
}

export interface RastroMap {
  map: MlMap;
}

export function createMap(container: HTMLElement, source: TileSource): Promise<RastroMap> {
  registerTileCache();
  const map = new MlMap({
    container,
    style: buildStyle(source),
    center: [-46.6576, -23.5874],
    zoom: 13,
    pitch: 0,
    interactive: false,
    attributionControl: false,
    pixelRatio: MAP_PIXEL_RATIO,
    fadeDuration: 0,
    maxPitch: 85,
    renderWorldCopies: false,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  });

  return new Promise((resolve, reject) => {
    map.once('load', () => resolve({ map }));
    map.on('error', (e) => {
      if (!map.loaded()) reject(e.error);
      else console.warn('[mapa]', e.error?.message);
    });
  });
}

const isReady = (map: MlMap) => map.loaded() && map.areTilesLoaded();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Desenha o mapa agora (síncrono, sem esperar o próximo quadro da tela); se faltar
 * tile, espera chegar e redesenha. Não depende de requestAnimationFrame, então
 * funciona com a aba em segundo plano e não perde ~16 ms por quadro esperando o vsync.
 */
export async function renderNow(map: MlMap, timeoutMs = 15000): Promise<void> {
  map.redraw();
  if (isReady(map)) return;
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    await sleep(4);
    // o estado dos tiles muda sozinho quando eles chegam; só redesenha quando vale a pena
    if (!map.areTilesLoaded()) continue;
    map.redraw();
    if (isReady(map)) return;
  }
}
