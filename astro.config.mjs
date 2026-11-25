import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

// Runs as the Cloudflare Worker `photofram` (see wrangler.jsonc). Pages render
// per request so content edited in the admin Worker is live at once.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://photofram.photofram-web.workers.dev', // PUBLIC_SITE_URL overrides (e.g. a custom domain later)
  output: 'server',
  session: false, // sessions are not used; avoids provisioning a KV namespace
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [sitemap(), react()],
});
