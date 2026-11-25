// AR previews (3D frame models) from the R2 bucket photofram-ar. The URL is
// public so Android Scene Viewer can fetch it. A lifecycle rule on the bucket
// deletes files after 7 days; anything older is treated as gone already.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { AR_LINK_DAYS, AR_PATH_RE } from '../../lib/arPaths';
import { serveR2 } from '../../lib/server/r2';

export const GET: APIRoute = ({ params, request }) => {
  const name = params.name ?? '';
  if (!AR_PATH_RE.test(name)) return new Response('Not found', { status: 404 });
  return serveR2(env.AR, name, request, {
    cacheControl: 'public, max-age=86400',
    maxAgeMs: AR_LINK_DAYS * 24 * 60 * 60 * 1000,
  });
};

export const HEAD = GET;
