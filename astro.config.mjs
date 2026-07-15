import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Localized application URLs are internally served by src/middleware.ts.
  site: 'https://runaway.money',
  output: 'static',
  trailingSlash: 'never',
  integrations: [react(), sitemap({ filter: (page) => !page.includes('/app') })],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: `http://localhost:${process.env.API_PORT ?? 8787}`,
          changeOrigin: true,
        },
      },
    },
  },
});
