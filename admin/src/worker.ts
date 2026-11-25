// Worker `photofram-admin`: serves the admin page and its JSON API. The whole
// hostname sits behind Cloudflare Access (email one-time code); every request,
// page or API, must also carry a valid Access token (see access.ts).
// It shares the D1 database and the photofram-media R2 bucket with the public
// Worker, so saves are live on the site immediately.
import { verifyAccess, type AccessEnv } from './access';

interface Env extends AccessEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  /** Public site address, for the "View site" button. */
  PUBLIC_SITE_URL: string;
  /** Local development only (admin/.dev.vars): skip the Access check. */
  DEV_SKIP_ACCESS?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const now = () => new Date().toISOString();
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const ID_RE = /^[\w-]{1,64}$/;
const MAX_JSON = 256 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function readJson(request: Request): Promise<any> {
  const text = await request.text();
  if (text.length > MAX_JSON) throw new HttpError(413, 'Too much data');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const parse = (s: unknown) => {
  try {
    return JSON.parse(String(s));
  } catch {
    return {};
  }
};

async function api(request: Request, env: Env, path: string, email: string): Promise<Response> {
  const method = request.method;
  const [resource, id] = path.split('/');
  if (id !== undefined && !ID_RE.test(id)) throw new HttpError(404, 'Not found');

  if (resource === 'content' && method === 'GET') {
    const [s, t, i] = await env.DB.batch([
      env.DB.prepare(`SELECT data FROM settings WHERE id = 'site'`),
      env.DB.prepare(`SELECT id, slug, position, hidden, data FROM templates ORDER BY position, created_at`),
      env.DB.prepare(`SELECT id, kind, position, hidden, data FROM items ORDER BY position, created_at`),
    ]);
    const rows = (r: D1Result) =>
      (r.results as Record<string, unknown>[]).map((x) => ({ ...x, hidden: !!x.hidden, data: parse(x.data) }));
    return json(200, {
      settings: s.results[0] ? parse((s.results[0] as { data: string }).data) : {},
      templates: rows(t),
      items: rows(i),
      siteUrl: env.PUBLIC_SITE_URL || '',
      email,
    });
  }

  if (resource === 'settings' && method === 'PUT') {
    const data = await readJson(request);
    if (!isObject(data) || typeof data.brand_name !== 'string' || !data.brand_name.trim()) {
      throw new HttpError(422, 'Brand name is required');
    }
    await env.DB.prepare(
      `INSERT INTO settings (id, data, updated_at) VALUES ('site', ?1, ?2)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
      .bind(JSON.stringify(data), now())
      .run();
    return json(200, { ok: true });
  }

  if (resource === 'templates' && method === 'POST' && id === undefined) {
    const body = await readJson(request);
    const slug = String(body?.slug ?? '').trim();
    if (!SLUG_RE.test(slug)) throw new HttpError(422, 'Slug may only use lowercase letters, numbers and dashes');
    if (!isObject(body.data)) throw new HttpError(422, 'Template design is missing');
    const data = JSON.stringify({ ...body.data, slug });
    if (body.id !== undefined) {
      if (typeof body.id !== 'string' || !ID_RE.test(body.id)) throw new HttpError(422, 'Invalid id');
      const clash = await env.DB.prepare(`SELECT id FROM templates WHERE slug = ?1 AND id != ?2`).bind(slug, body.id).first();
      if (clash) throw new HttpError(409, `Another template already uses /frames/${slug}`);
      const r = await env.DB.prepare(`UPDATE templates SET slug = ?1, data = ?2, updated_at = ?3 WHERE id = ?4`)
        .bind(slug, data, now(), body.id)
        .run();
      if (!r.meta.changes) throw new HttpError(404, 'Template not found');
    } else {
      // Same slug as an existing template: update it (as the Supabase upsert did).
      await env.DB.prepare(
        `INSERT INTO templates (id, slug, position, hidden, data, created_at, updated_at)
         VALUES (?1, ?2, (SELECT COALESCE(MAX(position) + 1, 0) FROM templates), 0, ?3, ?4, ?4)
         ON CONFLICT (slug) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
        .bind(crypto.randomUUID(), slug, data, now())
        .run();
    }
    return json(200, { ok: true });
  }

  if (resource === 'items' && method === 'POST' && id === undefined) {
    const body = await readJson(request);
    const kind = body?.kind;
    const d = body?.data;
    if (kind === 'review') {
      if (!isObject(d) || !String(d.name ?? '').trim() || !String(d.text ?? '').trim()) throw new HttpError(422, 'Name and review are required');
      const rating = Math.min(5, Math.max(1, Math.round(Number(d.rating) || 5)));
      body.data = { name: String(d.name).trim(), rating, text: String(d.text).trim() };
    } else if (kind === 'faq') {
      if (!isObject(d) || !String(d.q ?? '').trim() || !String(d.a ?? '').trim()) throw new HttpError(422, 'Question and answer are required');
      body.data = { q: String(d.q).trim(), a: String(d.a).trim() };
    } else {
      throw new HttpError(422, 'Unknown item type');
    }
    await env.DB.prepare(
      `INSERT INTO items (id, kind, position, hidden, data, created_at, updated_at)
       VALUES (?1, ?2, (SELECT COALESCE(MAX(position) + 1, 0) FROM items WHERE kind = ?2), 0, ?3, ?4, ?4)`,
    )
      .bind(crypto.randomUUID(), kind, JSON.stringify(body.data), now())
      .run();
    return json(200, { ok: true });
  }

  if ((resource === 'templates' || resource === 'items') && id !== undefined) {
    const table = resource; // fixed names only, never user input
    if (method === 'PATCH') {
      const body = await readJson(request);
      if (typeof body?.hidden !== 'boolean') throw new HttpError(422, 'Nothing to change');
      const r = await env.DB.prepare(`UPDATE ${table} SET hidden = ?1, updated_at = ?2 WHERE id = ?3`)
        .bind(body.hidden ? 1 : 0, now(), id)
        .run();
      if (!r.meta.changes) throw new HttpError(404, 'Not found');
      return json(200, { ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?1`).bind(id).run();
      return json(200, { ok: true });
    }
  }

  if (resource === 'media' && method === 'POST' && id === undefined) {
    const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = IMAGE_EXT[type];
    if (!ext) throw new HttpError(415, 'Please upload a PNG, JPEG, WebP, GIF, AVIF or SVG image');
    const body = await request.arrayBuffer();
    if (!body.byteLength) throw new HttpError(422, 'The file is empty');
    if (body.byteLength > MAX_IMAGE) throw new HttpError(413, 'Images must be 5 MB or smaller');
    const prefix =
      (new URL(request.url).searchParams.get('prefix') || 'image').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 60) || 'image';
    const key = `${prefix}-${Date.now()}.${ext}`;
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: type } });
    return json(200, { url: `/media/${key}` });
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const email = env.DEV_SKIP_ACCESS === '1' ? 'local development' : await verifyAccess(request, env);
    if (!email) {
      return new Response('Sign in through Cloudflare Access to use this page.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (url.pathname.startsWith('/api/admin/')) {
      // Changes must come from the admin page itself: the custom header can't
      // be sent cross-site without a CORS preflight, which this Worker never allows.
      if (request.method !== 'GET' && request.headers.get('x-admin') !== '1') return json(403, { error: 'Forbidden' });
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return json(403, { error: 'Forbidden' });
      try {
        return await api(request, env, url.pathname.slice('/api/admin/'.length), email);
      } catch (err) {
        if (err instanceof HttpError) return json(err.status, { error: err.message });
        console.error('[admin api]', err);
        const msg = String(err);
        if (/UNIQUE constraint failed: templates.slug/.test(msg)) return json(409, { error: 'Another template already uses that slug' });
        return json(500, { error: 'Something went wrong saving that. Please try again.' });
      }
    }

    const res = await env.ASSETS.fetch(request);
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', url.pathname.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'no-store');
    headers.set('X-Robots-Tag', 'noindex');
    headers.set('X-Frame-Options', 'DENY');
    return new Response(res.body, { status: res.status, headers });
  },
} satisfies ExportedHandler<Env>;
