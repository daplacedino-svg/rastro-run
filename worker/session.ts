// Sessão do Strava guardada num cookie criptografado (AES-GCM). Não há banco de dados:
// os tokens ficam só com o próprio usuário, ilegíveis para o navegador e para terceiros.

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** epoch em segundos */
  expiresAt: number;
  athlete: { id: number; firstname: string; profile?: string };
}

export const SESSION_COOKIE = 'rr_sess';
export const STATE_COOKIE = 'rr_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 dias

async function keyFrom(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function seal(session: Session, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(session));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(secret), data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64Url(out);
}

export async function unseal(value: string, secret: string): Promise<Session | null> {
  try {
    const bytes = fromB64Url(value);
    const iv = bytes.slice(0, 12);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await keyFrom(secret), bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(pt)) as Session;
  } catch {
    return null; // cookie adulterado, antigo ou de outro segredo
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function attrs(secure: boolean, path: string, maxAge: number): string {
  return `Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function sessionCookie(value: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${value}; ${attrs(secure, '/api', SESSION_MAX_AGE)}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; ${attrs(secure, '/api', 0)}`;
}

export function stateCookie(value: string, secure: boolean): string {
  return `${STATE_COOKIE}=${value}; ${attrs(secure, '/api/strava', 600)}`;
}

export function clearStateCookie(secure: boolean): string {
  return `${STATE_COOKIE}=; ${attrs(secure, '/api/strava', 0)}`;
}
