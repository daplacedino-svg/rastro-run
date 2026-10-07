// Worker do rodagem.run. O site é estático (pasta dist/, servida direto pelo Cloudflare);
// este código só responde em /api/* — hoje, a conexão com o Strava.

import {
  STATE_COOKIE,
  SESSION_COOKIE,
  clearSessionCookie,
  clearStateCookie,
  readCookie,
  seal,
  sessionCookie,
  stateCookie,
  unseal,
  type Session,
} from './session';
import {
  StravaError,
  activityTrack,
  authorizeUrl,
  exchangeCode,
  listActivities,
  refresh,
  revoke,
  type StravaCredentials,
} from './strava';

export interface Env {
  ASSETS: Fetcher;
  STRAVA_CLIENT_ID?: string;
  STRAVA_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  /** "true" libera o botão do Strava para todo mundo; antes disso só aparece no modo beta */
  STRAVA_PUBLIC?: string;
  /** origem pública do site (no dev local é o Vite: http://localhost:5173) */
  APP_ORIGIN?: string;
}

const PER_PAGE = 20;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (err) {
      if (err instanceof StravaError) return stravaFailure(err, env, request);
      console.error(err);
      return json({ error: 'erro-interno' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const origin = env.APP_ORIGIN || url.origin;
  const secure = origin.startsWith('https:');
  const creds = credentials(env);
  const path = url.pathname;

  if (path === '/api/strava/status') {
    if (!creds) return json({ configured: false });
    const session = await getSession(request, env);
    return json({
      configured: true,
      public: env.STRAVA_PUBLIC === 'true',
      connected: !!session,
      athlete: session ? { firstname: session.athlete.firstname, profile: session.athlete.profile } : null,
    });
  }

  if (!creds) return json({ error: 'nao-configurado' }, 503);

  if (path === '/api/strava/login' && request.method === 'GET') {
    const state = crypto.randomUUID();
    const target = authorizeUrl(creds.clientId, `${origin}/api/strava/callback`, state);
    return redirect(target, [stateCookie(state, secure)]);
  }

  if (path === '/api/strava/callback' && request.method === 'GET') {
    const back = (status: string, cookies: string[] = []) =>
      redirect(`${origin}/?strava=${status}`, [clearStateCookie(secure), ...cookies]);
    if (url.searchParams.get('error')) return back('negado');
    const state = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!state || !code || state !== readCookie(request, STATE_COOKIE)) return back('erro');
    const { session, scope } = await exchangeCode(creds, code);
    if (!scope.includes('activity:read')) return back('sem-permissao');
    return back('conectado', [sessionCookie(await seal(session, secret(env)), secure)]);
  }

  if (path === '/api/strava/logout' && request.method === 'POST') {
    const session = await getSession(request, env);
    if (session) await revoke(creds, session.refreshToken).catch(() => {});
    return json({ ok: true }, 200, [clearSessionCookie(secure)]);
  }

  // Daqui para baixo precisa estar conectado.
  const current = await getSession(request, env);
  if (!current) return json({ error: 'desconectado' }, 401);
  const { session, cookies } = await freshSession(current, creds, env, secure);

  if (path === '/api/strava/activities' && request.method === 'GET') {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    return json(await listActivities(session, page, PER_PAGE), 200, cookies);
  }

  const track = path.match(/^\/api\/strava\/activities\/(\d+)\/track$/);
  if (track && request.method === 'GET') {
    return json(await activityTrack(session, track[1]), 200, cookies);
  }

  return json({ error: 'nao-encontrado' }, 404);
}

function credentials(env: Env): StravaCredentials | null {
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET || !env.SESSION_SECRET) return null;
  return { clientId: env.STRAVA_CLIENT_ID, clientSecret: env.STRAVA_CLIENT_SECRET };
}

const secret = (env: Env) => env.SESSION_SECRET!;

async function getSession(request: Request, env: Env): Promise<Session | null> {
  const raw = readCookie(request, SESSION_COOKIE);
  return raw && env.SESSION_SECRET ? unseal(raw, env.SESSION_SECRET) : null;
}

/** Renova o access token se estiver para vencer e devolve o cookie novo a gravar. */
async function freshSession(
  session: Session,
  creds: StravaCredentials,
  env: Env,
  secure: boolean,
): Promise<{ session: Session; cookies: string[] }> {
  if (session.expiresAt - 120 > Date.now() / 1000) return { session, cookies: [] };
  const renewed = await refresh(creds, session);
  return { session: renewed, cookies: [sessionCookie(await seal(renewed, secret(env)), secure)] };
}

function stravaFailure(err: StravaError, env: Env, request: Request): Response {
  const secure = (env.APP_ORIGIN || new URL(request.url).origin).startsWith('https:');
  // 401/400 do Strava: autorização revogada ou refresh token inválido → pede para reconectar
  if (err.status === 401 || err.status === 400) return json({ error: 'desconectado' }, 401, [clearSessionCookie(secure)]);
  if (err.status === 429) return json({ error: 'limite' }, 429);
  if (err.status === 404) return json({ error: 'nao-encontrado' }, 404);
  if (err.status === 422) return json({ error: err.message }, 422);
  console.error(err);
  return json({ error: 'strava-indisponivel' }, 502);
}

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}
