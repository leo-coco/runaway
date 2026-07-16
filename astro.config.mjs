import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Localized app URLs (/en/app/*) are rewritten to /app by vercel.json in
  // production. src/middleware.ts mirrors that rule for `astro dev` only:
  // static-output middleware does not run at request time once deployed.
  // Keep the two in sync; the dev server is the only place middleware fires.
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
