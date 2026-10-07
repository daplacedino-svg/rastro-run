import './ui/styles.css';
import { VIDEO, videoDurationSec } from './config';
import { exportVideo, pickExportMethod, type ExportMethod, type ExportResult } from './export';
import { buildCameraPath } from './map/camera';
import { createMap, type RastroMap } from './map/create-map';
import { preloadTiles } from './map/preload';
import { tileCacheStats } from './map/tile-cache';
import { getTileSource } from './map/tile-sources';
import { loadRunnerSprites, type RunnerSprites } from './overlay/runner';
import { formatKm } from './overlay/hud';
import { parseTrackFile, TrackParseError, type RawTrack } from './parsers';
import { Compositor } from './render/compositor';
import { Preview } from './render/preview';
import { renderFrameExact, type Scene } from './render/scene';
import { activityUrl } from './strava/client';
import { initStravaPanel } from './ui/strava-panel';
import { Route } from './track/route';
import { formatDuration, formatSeconds, Stopwatch } from './ui/stopwatch';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  stepUpload: $('step-upload'),
  stepStudio: $('step-studio'),
  dropzone: $('dropzone'),
  fileInput: $<HTMLInputElement>('file-input'),
  sampleBtn: $<HTMLButtonElement>('sample-btn'),
  uploadError: $('upload-error'),
  canvas: $<HTMLCanvasElement>('preview-canvas'),
  video: $<HTMLVideoElement>('result-video'),
  loading: $('loading'),
  busy: $('busy'),
  busyLabel: $('busy-label'),
  busyBar: $('busy-bar'),
  busyDetail: $('busy-detail'),
  stopwatch: $('stopwatch'),
  cancelBtn: $<HTMLButtonElement>('cancel-btn'),
  controls: $('preview-controls'),
  playBtn: $<HTMLButtonElement>('play-btn'),
  iconPlay: $('icon-play'),
  iconPause: $('icon-pause'),
  scrubber: $<HTMLInputElement>('scrubber'),
  timeLabel: $('time-label'),
  trackInfo: $('track-info'),
  actions: $('actions'),
  exportBtn: $<HTMLButtonElement>('export-btn'),
  newFileBtn: $<HTMLButtonElement>('new-file-btn'),
  result: $('result'),
  downloadBtn: $<HTMLAnchorElement>('download-btn'),
  shareBtn: $<HTMLButtonElement>('share-btn'),
  backBtn: $<HTMLButtonElement>('back-btn'),
  resultStats: $('result-stats'),
  studioError: $('studio-error'),
  attribution: $('attribution'),
  mapHost: $('map-host'),
};

const params = new URLSearchParams(location.search);
const forcedMethod = params.get('metodo') as ExportMethod | null;
const tileSource = getTileSource();
ui.attribution.innerHTML = `Mapa: ${tileSource.attribution} · <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre</a>`;

// ---------- estado ----------
let rmap: RastroMap | null = null;
let sprites: RunnerSprites | null = null;
let compositor: Compositor | null = null;
let route: Route | null = null;
let scene: Scene | null = null;
let resultUrl: string | null = null;
let exportAbort: AbortController | null = null;

const preview = new Preview((frame, total, playing) => {
  ui.scrubber.max = String(total - 1);
  ui.scrubber.value = String(frame);
  ui.timeLabel.textContent = `${(frame / VIDEO.fps).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  ui.iconPlay.hidden = playing;
  ui.iconPause.hidden = !playing;
});

// ---------- carregar arquivo ----------
ui.fileInput.addEventListener('change', () => {
  const file = ui.fileInput.files?.[0];
  if (file) void loadFile(file);
  ui.fileInput.value = '';
});

ui.dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  ui.dropzone.classList.add('dragging');
});
ui.dropzone.addEventListener('dragleave', () => ui.dropzone.classList.remove('dragging'));
ui.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  ui.dropzone.classList.remove('dragging');
  const file = e.dataTransfer?.files[0];
  if (file) void loadFile(file);
});

ui.sampleBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/samples/exemplo.gpx');
    const text = res.ok ? await res.text() : '';
    // alguns hosts devolvem o index.html no lugar de um arquivo ausente (fallback de SPA)
    if (!/<gpx[\s>]/i.test(text.slice(0, 2000))) throw new Error('exemplo ausente');
    await loadFile(new File([text], 'exemplo.gpx', { type: 'application/gpx+xml' }));
  } catch {
    showError(ui.uploadError, 'O arquivo de exemplo ainda não foi incluído no projeto.');
  }
});

/** De onde veio o trajeto: arquivo enviado ou atividade do Strava. */
type TrackSource = { kind: 'file'; fileName: string } | { kind: 'strava'; activityId: number };

async function loadFile(file: File) {
  hideError(ui.uploadError);
  let raw: RawTrack;
  try {
    raw = await parseTrackFile(file);
  } catch (err) {
    showError(ui.uploadError, err instanceof TrackParseError ? err.message : 'Não foi possível ler este arquivo.');
    console.error(err);
    return;
  }
  await loadTrack(raw, { kind: 'file', fileName: file.name });
}

async function loadTrack(raw: RawTrack, source: TrackSource) {
  hideError(ui.uploadError);
  hideError(ui.studioError);
  route = new Route(raw);
  showStudio();
  renderTrackInfo(raw, route, source);

  if (!rmap) {
    ui.loading.hidden = false;
    try {
      [rmap, sprites] = await Promise.all([createMap(ui.mapHost, tileSource), loadRunnerSprites()]);
      compositor = new Compositor(rmap.map, sprites, tileSource.videoCredit, ui.canvas);
    } catch (err) {
      console.error(err);
      showError(ui.studioError, 'Não foi possível carregar o mapa. Verifique sua conexão.');
      return;
    } finally {
      ui.loading.hidden = true;
    }
  }
  rebuildScene();
  preview.play();
}

function rebuildScene() {
  if (!rmap || !route || !compositor) return;
  const path = buildCameraPath(route, rmap.map);
  scene = { rmap, route, path, compositor };
  preview.setScene(scene);
  if (import.meta.env.DEV) {
    const s = scene;
    (window as unknown as { __rastro: unknown }).__rastro = {
      scene: s,
      preview,
      tileCacheStats,
      renderExact: (i: number) => renderFrameExact(s, i),
    };
  }
}

function renderTrackInfo(raw: RawTrack, r: Route, source: TrackSource) {
  const times = raw.points.map((p) => p.time).filter((t): t is number => t != null);
  const items: [string, string, boolean?][] = [
    ['Distância', formatKm(r.displayDistance)],
    ['Tempo', times.length > 1 ? formatClock(times[times.length - 1] - times[0]) : '—'],
    ['Duração do vídeo', `${Math.round(videoDurationSec(r.displayDistance))} s`],
    ['Pontos de GPS', raw.points.length.toLocaleString('pt-BR')],
  ];
  if (source.kind === 'file') items.push(['Arquivo', source.fileName, true]);
  else items.push(['Atividade do Strava', raw.name ?? 'Sem nome', true]);
  ui.trackInfo.innerHTML = items
    .map(
      ([k, v, wide]) =>
        `<div${wide ? ' class="wide"' : ''}><dt>${k}</dt><dd title="${escapeHtml(v)}">${escapeHtml(v)}</dd></div>`,
    )
    .join('');
  if (source.kind === 'strava') {
    // o Strava exige o link "Ver no Strava" onde os dados dele aparecem
    const link = document.createElement('a');
    link.className = 'strava-view';
    link.href = activityUrl(source.activityId);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Ver no Strava';
    ui.trackInfo.lastElementChild?.append(link);
  }
}

// ---------- Strava ----------
void initStravaPanel({
  onPick: (raw, activity) => loadTrack(raw, { kind: 'strava', activityId: activity.id }),
});

// ---------- prévia ----------
ui.playBtn.addEventListener('click', () => (preview.isPlaying ? preview.pause() : preview.play()));
ui.scrubber.addEventListener('input', () => {
  preview.pause();
  preview.show(Number(ui.scrubber.value));
});

ui.newFileBtn.addEventListener('click', () => {
  preview.pause();
  ui.stepStudio.hidden = true;
  ui.stepUpload.hidden = false;
});

// ---------- exportar ----------
ui.exportBtn.addEventListener('click', () => void startExport());
ui.cancelBtn.addEventListener('click', () => exportAbort?.abort(new DOMException('Cancelado', 'AbortError')));

async function startExport() {
  if (!scene || !rmap) return;
  hideError(ui.studioError);
  const current = scene;
  preview.suspend();
  setBusy(true);
  const watch = new Stopwatch(ui.stopwatch);
  watch.start();
  const wakeLock = await requestWakeLock();
  exportAbort = new AbortController();
  const { signal } = exportAbort;

  try {
    const method = await pickExportMethod(forcedMethod);
    if (!method) throw new Error('Este navegador não consegue gerar vídeo. Tente o Chrome ou o Safari atualizados.');

    ui.busyLabel.textContent = 'Baixando mapas…';
    const tiles = await preloadTiles(
      rmap.map,
      current.path,
      tileSource,
      (f, done, total) => {
        ui.busyBar.style.width = `${(f * 100).toFixed(1)}%`;
        ui.busyDetail.textContent = `${done} de ${total} pedaços do mapa`;
      },
      signal,
    );
    watch.lap('Mapas');

    ui.busyLabel.textContent = method === 'webcodecs' ? 'Gerando vídeo…' : 'Gravando vídeo (tempo real)…';
    ui.busyBar.style.width = '0%';
    const renderStart = performance.now();
    const result = await exportVideo(
      current,
      method,
      ({ frame, total }) => {
        ui.busyBar.style.width = `${((frame / total) * 100).toFixed(1)}%`;
        const fps = frame / ((performance.now() - renderStart) / 1000);
        ui.busyDetail.textContent = `quadro ${frame} de ${total} · ${fps.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} q/s`;
      },
      signal,
    );
    watch.lap('Vídeo');
    const totalMs = watch.stop();
    showResult(result, totalMs, watch.laps, tiles);
  } catch (err) {
    watch.stop();
    if (signal.aborted) {
      preview.resume();
    } else {
      console.error(err);
      showError(ui.studioError, err instanceof Error ? err.message : 'Algo deu errado ao gerar o vídeo.');
      preview.resume();
    }
  } finally {
    exportAbort = null;
    setBusy(false);
    void wakeLock?.release().catch(() => {});
  }
}

function showResult(
  result: ExportResult,
  totalMs: number,
  laps: { name: string; ms: number }[],
  tiles: { total: number; failed: number },
) {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(result.blob);
  const fileName = `rodagem-run-${new Date().toISOString().slice(0, 10)}.${result.extension}`;

  ui.video.src = resultUrl;
  ui.video.muted = true;
  ui.video.hidden = false;
  ui.canvas.hidden = true;
  void ui.video.play().catch(() => {});

  ui.downloadBtn.href = resultUrl;
  ui.downloadBtn.download = fileName;
  ui.downloadBtn.textContent = `Baixar ${result.extension.toUpperCase()}`;

  const file = new File([result.blob], fileName, { type: result.blob.type });
  ui.shareBtn.hidden = !(navigator.canShare?.({ files: [file] }) ?? false);
  ui.shareBtn.onclick = () => void navigator.share({ files: [file] }).catch(() => {});

  const cache = tileCacheStats();
  const mapMs = laps.find((l) => l.name === 'Mapas')?.ms ?? 0;
  const videoMs = laps.find((l) => l.name === 'Vídeo')?.ms ?? 0;
  const stats: [string, string, boolean?][] = [
    ['Tempo total de geração', formatDuration(totalMs), true],
    ['Baixando mapas', formatSeconds(mapMs)],
    ['Gerando vídeo', formatSeconds(videoMs)],
    ['Método', result.method === 'webcodecs' ? 'WebCodecs (MP4)' : `MediaRecorder (${result.extension.toUpperCase()})`],
    ['Tamanho', `${(result.blob.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`],
    ['Tiles', `${tiles.total}${tiles.failed ? ` (${tiles.failed} falharam)` : ''}`],
    ['Cache de mapa', `${cache.megabytes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`],
  ];
  ui.resultStats.innerHTML = stats
    .map(([k, v, wide]) => `<div${wide ? ' class="wide"' : ''}><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');

  ui.controls.hidden = true;
  ui.actions.hidden = true;
  ui.result.hidden = false;
}

ui.backBtn.addEventListener('click', () => {
  ui.video.pause();
  ui.video.hidden = true;
  ui.canvas.hidden = false;
  ui.result.hidden = true;
  ui.controls.hidden = false;
  ui.actions.hidden = false;
  preview.resume();
});

// ---------- utilidades ----------
function showStudio() {
  ui.stepUpload.hidden = true;
  ui.stepStudio.hidden = false;
  ui.result.hidden = true;
  ui.video.hidden = true;
  ui.canvas.hidden = false;
  ui.controls.hidden = false;
  ui.actions.hidden = false;
}

function setBusy(on: boolean) {
  ui.busy.hidden = !on;
  ui.exportBtn.disabled = on;
  ui.playBtn.disabled = on;
  ui.scrubber.disabled = on;
  ui.newFileBtn.disabled = on;
  if (on) {
    ui.busyBar.style.width = '0%';
    ui.busyLabel.textContent = 'Preparando…';
    ui.busyDetail.textContent = 'Mantenha esta tela aberta';
  }
}

async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    return (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    return null;
  }
}

function showError(el: HTMLElement, msg: string) {
  el.textContent = msg;
  el.hidden = false;
}

function hideError(el: HTMLElement) {
  el.hidden = true;
}

function formatClock(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}min` : `${m}min${String(sec).padStart(2, '0')}s`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
