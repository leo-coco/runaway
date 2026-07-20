# Technical SEO Findings — runaway.money

## Critical: canonical/hreflang/sitemap point to a redirecting host
`astro.config.mjs:12` sets `site: 'https://runaway.money'`. Production Vercel domain redirects non-www → `www.runaway.money` (308, confirmed live via `curl -sI`). Every canonical, hreflang alternate, `og:url`, and sitemap URL derives from `Astro.site` (`src/layouts/MarketingLayout.astro:28,75-77`) and is therefore built on the redirecting host. Confirmed on all 8 crawled URLs.
**Fix:** `site: 'https://www.runaway.money'` in astro.config.mjs; update `Sitemap:` line in public/robots.txt.

## High: missing security headers
Live response headers show only `strict-transport-security`. No CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy. `vercel.json`'s `headers` block only covers static-asset caching.
**Fix:** add a security headers block to vercel.json, scoped to not break the `/app` SPA.

## Working correctly
- robots.txt: `Allow: /`, disallows `/app/`, `/*/app/`, `/api/` — auth surface correctly hidden from crawlers.
- Sitemap index → sitemap-0.xml valid, 8 URLs, lastmod present (generated via @astrojs/sitemap).
- robots meta tag (`index, follow, max-image-preview:large`) correct on all sampled pages.
