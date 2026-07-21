import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import sentry from '@sentry/astro';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const legalIdentity = JSON.parse(
  readFileSync(new URL('./src/config/legal.json', import.meta.url), 'utf8'),
);

/** Mirrors `isLegalIdentityComplete` in src/config/legal.ts — keep the two in sync. */
const legalPagesArePublishable = Object.entries(legalIdentity).every(([key, value]) =>
  key === 'vatNumber'
    ? true
    : typeof value === 'string'
      ? value.trim().length > 0
      : Object.values(value).every((nested) => nested.trim().length > 0),
);

const legalPaths = {
  '/confidentialite': '/en/privacy',
  '/mentions-legales': '/en/legal-notice',
  '/conditions-utilisation': '/en/terms',
  '/conditions-vente': '/en/sales-terms',
};

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
    // release.inject and debug-ID injection default to on and emit inline
    // bootstrap <script> tags (window.SENTRY_RELEASE, _sentryDebugIds) into
    // page <head>s and island scripts, which violate our strict
    // script-src 'self' CSP. The top-level `release` option is a no-op
    // passthrough in @sentry/astro (see its integration/index.ts), so
    // `release.inject` must go through unstable_sentryVitePluginOptions to
    // actually reach the underlying @sentry/vite-plugin. We don't upload
    // source maps (no auth token configured), so disable that machinery
    // entirely rather than just hiding its output.
    sentry({
      telemetry: false,
      sourcemaps: { disable: true },
      unstable_sentryVitePluginOptions: { release: { inject: false } },
    }),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        // Legal pages ship noindex until src/config/legal.json is filled; listing
        // them meanwhile would only earn "submitted URL marked noindex" in GSC.
        const isLegal = path in legalPaths || Object.values(legalPaths).includes(path);
        if (isLegal && !legalPagesArePublishable) return false;
        return !page.includes('/app') && !page.endsWith('/sandbox') && !page.endsWith('/en/sandbox');
      },
      lastmod: new Date(),
      serialize(item) {
        const path = new URL(item.url).pathname;
        const frToEn = {
          '/': '/en',
          '/a-propos': '/en/about',
          '/contact': '/en/contact',
          '/methodologie': '/en/methodology',
          '/exemples': '/en/examples',
          ...legalPaths,
        };
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
    // The React app is mounted from a script in AppPage.astro rather than from
    // an HTML entry Vite can discover during its initial crawl. Scan it eagerly
    // so opening /:lang/app/* does not trigger a second dependency bundle and
    // leave Firefox requesting an obsolete, empty 504 response.
    optimizeDeps: {
      entries: ['src/main.tsx'],
    },
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
