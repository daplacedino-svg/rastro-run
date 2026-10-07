// Chamadas ao Strava (OAuth + API v3). Documentação: https://developers.strava.com/docs/

import type { Session } from './session';

const OAUTH = 'https://www.strava.com/oauth';
const API = 'https://www.strava.com/api/v3';

/** activity:read_all inclui corridas "Só você" e trechos em zonas de privacidade. */
export const SCOPE = 'activity:read_all';

export class StravaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface StravaCredentials {
  clientId: string;
  clientSecret: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number; firstname?: string; profile_medium?: string };
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
    state,
  });
  return `${OAUTH}/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new StravaError(res.status, `token ${res.status}`);
  return res.json();
}

export async function exchangeCode(
  creds: StravaCredentials,
  code: string,
): Promise<{ session: Session; scope: string }> {
  const t = await tokenRequest({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    grant_type: 'authorization_code',
  });
  return {
    scope: t.scope ?? '',
    session: {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: t.expires_at,
      athlete: {
        id: t.athlete?.id ?? 0,
        firstname: t.athlete?.firstname ?? '',
        profile: t.athlete?.profile_medium,
      },
    },
  };
}

/** O access token dura 6 h. O refresh token muda a cada renovação: o antigo deixa de valer. */
export async function refresh(creds: StravaCredentials, session: Session): Promise<Session> {
  const t = await tokenRequest({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: session.refreshToken,
    grant_type: 'refresh_token',
  });
  return { ...session, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_at };
}

export async function revoke(creds: StravaCredentials, token: string): Promise<void> {
  await fetch(`${OAUTH}/revoke`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ token, token_type_hint: 'refresh_token' }),
  });
}

async function api<T>(session: Session, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
  if (!res.ok) throw new StravaError(res.status, `api ${path} ${res.status}`);
  return res.json();
}

interface SummaryActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  total_elevation_gain?: number;
  map?: { summary_polyline?: string | null };
}

/** Só o necessário para a lista, e apenas atividades com GPS. */
export async function listActivities(session: Session, page: number, perPage: number) {
  const list = await api<SummaryActivity[]>(session, `/athlete/activities?page=${page}&per_page=${perPage}`);
  return {
    hasMore: list.length === perPage,
    activities: list
      .filter((a) => a.map?.summary_polyline)
      .map((a) => ({
        id: a.id,
        name: a.name,
        sportType: a.sport_type,
        startDate: a.start_date,
        startDateLocal: a.start_date_local,
        distance: a.distance,
        movingTime: a.moving_time,
        elevationGain: a.total_elevation_gain ?? null,
        polyline: a.map!.summary_polyline!,
      })),
  };
}

interface Stream<T> {
  data: T[];
}

/** Trajeto completo (todos os pontos) em formato compacto: [lat, lon, ele|null, segundos]. */
export async function activityTrack(session: Session, id: string) {
  const s = await api<{
    latlng?: Stream<[number, number]>;
    altitude?: Stream<number>;
    time?: Stream<number>;
  }>(session, `/activities/${id}/streams?keys=latlng,altitude,time&key_by_type=true`);
  const latlng = s.latlng?.data ?? [];
  if (latlng.length < 2) throw new StravaError(422, 'sem-gps');
  return {
    points: latlng.map(([lat, lon], i) => [lat, lon, s.altitude?.data[i] ?? null, s.time?.data[i] ?? null]),
  };
}
