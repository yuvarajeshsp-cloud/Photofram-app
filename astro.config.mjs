import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://photofram.example.com', // set to the real domain before the first deploy
  integrations: [sitemap(), react()],
});
