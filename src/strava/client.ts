// Conversa com o Worker (/api/strava/*). Os tokens do Strava nunca chegam ao navegador:
// ficam num cookie criptografado que só o Worker lê.

import type { RawTrack } from '../parsers';

export interface StravaStatus {
  configured: boolean;
  public?: boolean;
  connected?: boolean;
  athlete?: { firstname: string; profile?: string } | null;
}

export interface StravaActivity {
  id: number;
  name: string;
  sportType: string;
  startDate: string;
  startDateLocal: string;
  distance: number;
  movingTime: number;
  elevationGain: number | null;
  polyline: string;
}

export class StravaClientError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const STRAVA_LOGIN_URL = '/api/strava/login';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin', ...init });
  } catch {
    throw new StravaClientError('rede');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new StravaClientError(body.error ?? `http-${res.status}`);
  return body as T;
}

export async function getStatus(): Promise<StravaStatus> {
  try {
    return await call<StravaStatus>('/api/strava/status');
  } catch {
    return { configured: false }; // sem Worker (ex.: `npm run dev` sem o dev:api)
  }
}

export function listActivities(page: number) {
  return call<{ activities: StravaActivity[]; hasMore: boolean }>(`/api/strava/activities?page=${page}`);
}

export async function fetchTrack(activity: StravaActivity): Promise<RawTrack> {
  const { points } = await call<{ points: [number, number, number | null, number | null][] }>(
    `/api/strava/activities/${activity.id}/track`,
  );
  const start = Date.parse(activity.startDate);
  return {
    name: activity.name,
    sport: activity.sportType,
    reportedDistance: activity.distance,
    movingTime: activity.movingTime,
    elevationGain: activity.elevationGain ?? undefined,
    points: points.map(([lat, lon, ele, t]) => ({
      lat,
      lon,
      ele: ele ?? undefined,
      time: t != null && Number.isFinite(start) ? start + t * 1000 : undefined,
    })),
  };
}

export function logout() {
  return call<{ ok: boolean }>('/api/strava/logout', { method: 'POST' });
}

export function activityUrl(id: number): string {
  return `https://www.strava.com/activities/${id}`;
}

/** Mensagem amigável para cada erro do Worker. */
export function errorMessage(code: string): string {
  switch (code) {
    case 'desconectado':
      return 'Sua conexão com o Strava expirou. Conecte de novo.';
    case 'limite':
      return 'O Strava está recebendo muitos pedidos agora. Tente de novo em alguns minutos.';
    case 'sem-gps':
      return 'Essa atividade não tem trajeto de GPS.';
    case 'nao-encontrado':
      return 'Atividade não encontrada no Strava.';
    case 'rede':
      return 'Sem conexão com a internet.';
    default:
      return 'Não foi possível falar com o Strava agora. Tente de novo.';
  }
}
