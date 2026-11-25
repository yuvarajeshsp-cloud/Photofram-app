// Logos and catalog images uploaded in admin, stored in the R2 bucket
// photofram-media. Every upload gets a new name, so they can be cached for good.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { serveR2 } from '../../lib/server/r2';

export const GET: APIRoute = ({ params, request }) => {
  const key = params.key ?? '';
  if (!/^[\w.-]{1,200}$/.test(key)) return new Response('Not found', { status: 404 });
  return serveR2(env.MEDIA, key, request, { cacheControl: 'public, max-age=31536000, immutable' });
};

export const HEAD = GET;
