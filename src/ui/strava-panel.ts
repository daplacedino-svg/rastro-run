// Painel "Conectar com Strava" + lista de atividades na tela inicial.

import type { RawTrack } from '../parsers';
import { formatKm } from '../overlay/hud';
import {
  STRAVA_LOGIN_URL,
  StravaClientError,
  errorMessage,
  fetchTrack,
  getStatus,
  listActivities,
  logout,
  type StravaActivity,
} from '../strava/client';
import { polylineToSvgPath } from '../strava/polyline';

const BETA_KEY = 'rr-strava-beta';

const OAUTH_MESSAGES: Record<string, string> = {
  negado: 'Você não autorizou o acesso ao Strava.',
  'sem-permissao': 'Para gerar o vídeo, é preciso permitir o acesso às suas atividades.',
  erro: 'Não foi possível conectar com o Strava. Tente de novo.',
};

const SPORT_LABELS: Record<string, string> = {
  Run: 'Corrida',
  TrailRun: 'Trail',
  Walk: 'Caminhada',
  Hike: 'Trilha',
  Ride: 'Pedal',
  MountainBikeRide: 'MTB',
  GravelRide: 'Gravel',
};

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

interface Options {
  onPick(raw: RawTrack, activity: StravaActivity): Promise<void>;
}

export async function initStravaPanel({ onPick }: Options): Promise<void> {
  const $ = (id: string) => document.getElementById(id)!;
  const box = $('strava-box');
  const divider = $('or-divider');
  const connectBtn = $('strava-connect') as HTMLAnchorElement;
  const connected = $('strava-connected');
  const hello = $('strava-hello');
  const list = $('strava-list');
  const moreBtn = $('strava-more') as HTMLButtonElement;
  const logoutBtn = $('strava-logout') as HTMLButtonElement;
  const errorEl = $('strava-error');

  // ?strava-beta=1 libera o botão neste navegador antes da aprovação do app no Strava
  const params = new URLSearchParams(location.search);
  if (params.get('strava-beta') === '1') store(BETA_KEY, '1');
  if (params.get('strava-beta') === '0') store(BETA_KEY, null);
  const beta = params.get('strava-beta') === '1' || (params.get('strava-beta') !== '0' && read(BETA_KEY) === '1');
  const oauthResult = params.get('strava');
  if (oauthResult || params.has('strava-beta')) {
    params.delete('strava');
    params.delete('strava-beta');
    const clean = `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`;
    history.replaceState(null, '', clean);
  }

  const status = await getStatus();
  if (!status.configured || !(status.public || beta)) return;

  box.hidden = false;
  divider.hidden = false;
  $('privacy-strava').hidden = false;
  connectBtn.href = STRAVA_LOGIN_URL;
  if (oauthResult && OAUTH_MESSAGES[oauthResult]) showError(OAUTH_MESSAGES[oauthResult]);

  let page = 1;
  let busy = false;

  if (status.connected) {
    showConnected(status.athlete?.firstname);
    await loadPage();
  } else {
    showDisconnected();
  }

  moreBtn.addEventListener('click', () => void loadPage());

  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    await logout().catch(() => {});
    logoutBtn.disabled = false;
    showDisconnected();
  });

  function showConnected(firstname?: string) {
    connectBtn.hidden = true;
    connected.hidden = false;
    hello.textContent = firstname ? `Olá, ${firstname}! Escolha uma atividade:` : 'Escolha uma atividade:';
    list.replaceChildren();
    page = 1;
  }

  function showDisconnected() {
    connectBtn.hidden = false;
    connected.hidden = true;
    list.replaceChildren();
  }

  async function loadPage() {
    if (busy) return;
    busy = true;
    hideError();
    moreBtn.disabled = true;
    moreBtn.textContent = 'Carregando…';
    try {
      const { activities, hasMore } = await listActivities(page);
      for (const a of activities) list.append(renderItem(a));
      if (page === 1 && !activities.length && !hasMore) {
        const empty = document.createElement('li');
        empty.className = 'activity-empty';
        empty.textContent = 'Nenhuma atividade com GPS encontrada.';
        list.append(empty);
      }
      page++;
      moreBtn.hidden = !hasMore;
    } catch (err) {
      handleError(err);
    } finally {
      busy = false;
      moreBtn.disabled = false;
      moreBtn.textContent = 'Carregar mais';
    }
  }

  function renderItem(a: StravaActivity): HTMLLIElement {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'activity';
    const path = polylineToSvgPath(a.polyline, 48);
    const sport = SPORT_LABELS[a.sportType] ?? a.sportType;
    const meta = [dateFormat.format(new Date(a.startDateLocal)), formatKm(a.distance), formatMinutes(a.movingTime)];
    btn.innerHTML = `
      <svg class="activity-thumb" viewBox="0 0 48 48" aria-hidden="true"><path d="${path}"/></svg>
      <span class="activity-text">
        <span class="activity-name"></span>
        <span class="activity-meta"></span>
      </span>
      <span class="activity-sport"></span>`;
    btn.querySelector('.activity-name')!.textContent = a.name;
    btn.querySelector('.activity-meta')!.textContent = meta.join(' · ');
    btn.querySelector('.activity-sport')!.textContent = sport;
    btn.addEventListener('click', () => void pick(a, btn));
    li.append(btn);
    return li;
  }

  async function pick(a: StravaActivity, btn: HTMLButtonElement) {
    if (busy) return;
    busy = true;
    hideError();
    btn.classList.add('loading');
    const meta = btn.querySelector('.activity-meta')!;
    const original = meta.textContent;
    meta.textContent = 'Carregando trajeto…';
    try {
      const raw = await fetchTrack(a);
      await onPick(raw, a);
    } catch (err) {
      handleError(err);
    } finally {
      busy = false;
      btn.classList.remove('loading');
      meta.textContent = original;
    }
  }

  function handleError(err: unknown) {
    const code = err instanceof StravaClientError ? err.code : 'erro';
    if (!(err instanceof StravaClientError)) console.error(err);
    showError(errorMessage(code));
    if (code === 'desconectado') showDisconnected();
  }

  function showError(msg: string) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function hideError() {
    errorEl.hidden = true;
  }
}

function formatMinutes(sec: number): string {
  const min = Math.round(sec / 60);
  return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min}min`;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* modo privado: o beta só vale nesta visita */
  }
}
