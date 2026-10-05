// Único lugar que sabe de onde vêm as imagens de satélite.
// Para trocar de provedor, defina no .env (ou nas variáveis do Cloudflare Pages):
//   VITE_TILE_PROVIDER=mapbox   + VITE_MAPBOX_TOKEN=pk....
//   VITE_TILE_PROVIDER=maptiler + VITE_MAPTILER_KEY=....
// Sem nada configurado, usa Esri World Imagery (gratuito para protótipo, exige atribuição).

export interface TileSource {
  id: string;
  /** URLs https com {z}/{x}/{y} */
  tiles: string[];
  tileSize: 256 | 512;
  maxzoom: number;
  /** atribuição em HTML para a interface */
  attribution: string;
  /** crédito curto gravado no canto do vídeo */
  videoCredit: string;
}

const esri: TileSource = {
  id: 'esri',
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  maxzoom: 19,
  attribution:
    'Powered by <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a> — Esri, Maxar, Earthstar Geographics, GIS User Community',
  videoCredit: 'Imagens: Esri, Maxar, Earthstar Geographics',
};

function mapbox(token: string): TileSource {
  return {
    id: 'mapbox',
    tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${token}`],
    tileSize: 512,
    maxzoom: 22,
    attribution: '© <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">Mapbox</a> © Maxar',
    videoCredit: '© Mapbox © Maxar',
  };
}

function maptiler(key: string): TileSource {
  return {
    id: 'maptiler',
    tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${key}`],
    tileSize: 512,
    maxzoom: 20,
    attribution: '© <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a>',
    videoCredit: '© MapTiler',
  };
}

export function getTileSource(): TileSource {
  const env = import.meta.env;
  const provider = (env.VITE_TILE_PROVIDER ?? '').toLowerCase();
  if (provider === 'mapbox' && env.VITE_MAPBOX_TOKEN) return mapbox(env.VITE_MAPBOX_TOKEN);
  if (provider === 'maptiler' && env.VITE_MAPTILER_KEY) return maptiler(env.VITE_MAPTILER_KEY);
  return esri;
}
