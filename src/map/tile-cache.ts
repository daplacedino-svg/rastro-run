import { addProtocol } from 'maplibre-gl';

// Todos os tiles passam por aqui (protocolo "rastro://"), então o que o pré-carregamento
// baixa fica guardado em memória e a gravação não depende mais da rede.

export const CACHE_PROTOCOL = 'rastro';

const done = new Map<string, ArrayBuffer>();
const inflight = new Map<string, Promise<ArrayBuffer>>();
let bytes = 0;
let registered = false;

export function toCachedUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:\/\//, `${CACHE_PROTOCOL}://`);
}

function fetchTile(url: string): Promise<ArrayBuffer> {
  const hit = done.get(url);
  if (hit) return Promise.resolve(hit);
  let pending = inflight.get(url);
  if (!pending) {
    // Sem AbortSignal de propósito: mesmo que o MapLibre desista do tile, ele vai para o cache.
    pending = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`tile ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        done.set(url, buf);
        bytes += buf.byteLength;
        return buf;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  return pending;
}

export function registerTileCache(): void {
  if (registered) return;
  registered = true;
  addProtocol(CACHE_PROTOCOL, async (params) => {
    const url = params.url.replace(new RegExp(`^${CACHE_PROTOCOL}://`), 'https://');
    const buf = await fetchTile(url);
    // cópia: o MapLibre pode transferir o buffer e não queremos esvaziar o cache
    return { data: buf.slice(0) };
  });
}

/** Baixa uma lista de URLs para o cache, `concurrency` de cada vez. Tiles que falham são ignorados. */
export async function prefetchTiles(
  urls: string[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  concurrency = 12,
): Promise<{ failed: number }> {
  let next = 0;
  let finished = 0;
  let failed = 0;
  const worker = async () => {
    while (next < urls.length) {
      signal?.throwIfAborted();
      const url = urls[next++];
      try {
        await fetchTile(url);
      } catch {
        failed++;
      }
      onProgress(++finished, urls.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  signal?.throwIfAborted();
  return { failed };
}

export function tileCacheStats(): { tiles: number; megabytes: number } {
  return { tiles: done.size, megabytes: bytes / 1024 / 1024 };
}

export function clearTileCache(): void {
  done.clear();
  bytes = 0;
}
