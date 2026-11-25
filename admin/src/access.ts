// Verifies the Cloudflare Access token (Cf-Access-Jwt-Assertion) that Access
// adds to every request it lets through. Access already blocks anyone not
// signed in; this check means the Worker also refuses requests that did not
// come through Access (for example if the Access app were ever removed).
export interface AccessEnv {
  /** e.g. "photofram.cloudflareaccess.com" */
  ACCESS_TEAM_DOMAIN: string;
  /** Application Audience (AUD) tag of the Access app. */
  ACCESS_AUD: string;
}

type Jwk = JsonWebKey & { kid: string };
let certs: { keys: Jwk[]; at: number } | null = null;

async function getKeys(team: string, force = false): Promise<Jwk[]> {
  if (!force && certs && Date.now() - certs.at < 60 * 60 * 1000) return certs.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  certs = { keys, at: Date.now() };
  return keys;
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

/** Returns the signed-in email, or null if the token is missing or invalid. */
export async function verifyAccess(request: Request, env: AccessEnv): Promise<string | null> {
  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!team || !env.ACCESS_AUD) return null;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson(parts[0]);
    const payload = decodeJson(parts[1]);
    if (header.alg !== 'RS256') return null;

    let jwk = (await getKeys(team)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await getKeys(team, true)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    const aud: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (payload.iss !== `https://${team}`) return null;
    if (typeof payload.exp !== 'number' || payload.exp < now - 30) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now + 30) return null;
    return typeof payload.email === 'string' ? payload.email : 'signed in';
  } catch {
    return null;
  }
}
