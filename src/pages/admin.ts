// The admin lives on its own Worker (photofram-admin) behind Cloudflare
// Access; /admin on the public site just points there.
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = ({ redirect }) => {
  const url = (env as unknown as Record<string, string | undefined>).ADMIN_URL;
  return url ? redirect(url, 302) : new Response('Not found', { status: 404 });
};
