/// <reference types="astro/client" />

// Bindings of the `photofram` Worker (wrangler.jsonc). Declared by hand rather
// than with `wrangler types`, whose runtime types clash with the DOM types the
// browser scripts in src/ use.
declare module 'cloudflare:workers' {
  export const env: {
    DB: import('./lib/content').D1Like;
    MEDIA: import('./lib/server/r2').R2Like;
    AR: import('./lib/server/r2').R2Like;
    ADMIN_URL?: string;
    PUBLIC_META_PIXEL_ID?: string;
    META_CAPI_TOKEN?: string;
    META_TEST_EVENT_CODE?: string;
  };
}
