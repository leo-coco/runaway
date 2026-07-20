import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import sentry from '@sentry/astro';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Localized app URLs (/en/app/*) are rewritten to /app by vercel.json in
  // production. src/middleware.ts mirrors that rule for `astro dev` only:
  // static-output middleware does not run at request time once deployed.
  // Keep the two in sync; the dev server is the only place middleware fires.
  site: 'https://www.runaway.money',
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    react(),
    sentry({ telemetry: false }),
    sitemap({
      filter: (page) => !page.includes('/app'),
      lastmod: new Date(),
      serialize(item) {
        const path = new URL(item.url).pathname;
        const frToEn = { '/': '/en', '/a-propos': '/en/about', '/contact': '/en/contact', '/methodologie': '/en/methodology' };
        const enToFr = Object.fromEntries(Object.entries(frToEn).map(([fr, en]) => [en, fr]));
        const frPath = frToEn[path] ? path : (enToFr[path] ?? null);
        const enPath = frToEn[path] ?? (enToFr[path] ? path : null);
        if (!frPath || !enPath) return item;
        return {
          ...item,
          links: [
            { lang: 'fr', url: new URL(frPath, item.url).href },
            { lang: 'en', url: new URL(enPath, item.url).href },
            { lang: 'x-default', url: new URL(frPath, item.url).href },
          ],
        };
      },
    }),
  ],
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
