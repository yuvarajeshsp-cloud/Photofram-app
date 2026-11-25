// Loads the latest content from D1 before each page renders, so edits made in
// the admin Worker show up immediately. Files and API routes skip it.
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { loadContent } from './lib/content';
import { refreshSite } from './config/site';

const SKIP = /^\/(api|media|ar-files)\//;

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.isPrerendered || SKIP.test(ctx.url.pathname)) return next();
  await loadContent(env.DB);
  refreshSite(ctx.url.origin);
  return next();
});
