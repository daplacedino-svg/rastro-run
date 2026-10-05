import { Map as MlMap, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// O MapLibre 6 carrega o worker por URL relativa ao próprio módulo, o que não sobrevive ao
// bundle do Vite. Empacotamos o worker (com as dependências dele) e passamos a URL explícita.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);
import { MAP_PIXEL_RATIO, STYLE } from '../config';
import type { Route } from '../track/route';
import { registerTileCache, toCachedUrl } from './tile-cache';
import type { TileSource } from './tile-sources';

const ROUTE_SOURCE = 'route';
const ROUTE_LAYERS = ['route-glow', 'route-casing', 'route-line'] as const;
const ROUTE_COLORS: Record<(typeof ROUTE_LAYERS)[number], string> = {
  'route-glow': STYLE.routeColor,
  'route-casing': STYLE.routeCasing,
  'route-line': STYLE.routeColor,
};

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
      [ROUTE_SOURCE]: {
        type: 'geojson',
        lineMetrics: true,
        data: { type: 'FeatureCollection', features: [] },
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
      {
        id: 'route-glow',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': STYLE.routeWidth * 3, 'line-blur': STYLE.routeWidth * 1.5, 'line-opacity': 0.45 },
      },
      {
        id: 'route-casing',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': STYLE.routeWidth + 4 },
      },
      {
        id: 'route-line',
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-width': STYLE.routeWidth },
      },
    ],
  };
}

export interface RastroMap {
  map: MlMap;
  setRoute(route: Route): void;
  /** Revela o trajeto até a fração `p` (0..1). */
  setProgress(p: number): void;
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

  let lastProgress = -1;
  const api: RastroMap = {
    map,
    setRoute(route) {
      const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource;
      src.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: route.coords },
      });
      lastProgress = -1;
      api.setProgress(0);
    },
    setProgress(p) {
      const clamped = Math.min(1, Math.max(0, p));
      if (Math.abs(clamped - lastProgress) < 1e-6) return;
      lastProgress = clamped;
      for (const id of ROUTE_LAYERS) {
        map.setPaintProperty(id, 'line-gradient', revealGradient(ROUTE_COLORS[id], clamped));
      }
    },
  };

  return new Promise((resolve, reject) => {
    map.once('load', () => resolve(api));
    map.on('error', (e) => {
      if (!map.loaded()) reject(e.error);
      else console.warn('[mapa]', e.error?.message);
    });
  });
}

function revealGradient(color: string, p: number): ExpressionSpecification {
  if (p >= 1) return ['step', ['line-progress'], color, 2, color];
  if (p <= 0) return ['step', ['line-progress'], 'rgba(0,0,0,0)', 2, 'rgba(0,0,0,0)'];
  return ['step', ['line-progress'], color, p, 'rgba(0,0,0,0)'];
}

const isReady = (map: MlMap) => map.loaded() && map.areTilesLoaded();

/**
 * Desenha o mapa agora (síncrono, sem esperar o próximo quadro da tela); se faltar
 * tile, redesenha a cada tile que chega até ficar completo. Não depende de
 * requestAnimationFrame, então funciona igual com a aba em segundo plano e não
 * perde ~16 ms por quadro esperando o vsync.
 */
export async function renderNow(map: MlMap, timeoutMs = 15000): Promise<void> {
  map.redraw();
  if (isReady(map)) return;
  await new Promise<void>((resolve) => {
    let scheduled = false;
    const check = () => {
      scheduled = false;
      map.redraw();
      if (isReady(map)) finish();
    };
    const onData = () => {
      if (!scheduled) {
        scheduled = true;
        setTimeout(check, 0);
      }
    };
    const poll = setInterval(check, 100); // rede para quando um evento se perde
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearInterval(poll);
      clearTimeout(timer);
      map.off('data', onData);
      map.off('dataabort', onData);
      map.off('error', onData);
      resolve();
    }
    map.on('data', onData);
    map.on('dataabort', onData);
    map.on('error', onData);
  });
}
