// Builds the admin page (admin/index.html + src/scripts/admin.ts) into
// admin/dist, which the admin Worker serves as static assets.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: 'dist', emptyOutDir: true },
});
