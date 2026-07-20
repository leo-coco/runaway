# SEO Audit — runaway.money

**Date:** 2026-07-20
**Business type:** SaaS (indie/solo-developer financial planning tool — retirement & FI simulator), freemium with a Premium (Monte Carlo) tier
**Scope:** 8 URLs (sitemap-declared): `/`, `/en`, `/a-propos`, `/en/about`, `/methodologie`, `/en/methodology`, `/contact`, `/en/contact`. No blog/content-marketing section exists yet.
**Codebase cross-check:** This audit was run against the live site and verified against source in this repo (`astro.config.mjs`, `src/layouts/MarketingLayout.astro`, `vercel.json`), so findings below are traced to root cause, not just symptom.

## SEO Health Score: 68/100

| Category | Score | Weight |
|---|---|---|
| Technical SEO | 55/100 | 22% |
| Content Quality | 82/100 | 23% |
| On-Page SEO | 80/100 | 20% |
| Schema / Structured Data | 60/100 | 10% |
| Performance (CWV) | N/A — lab data unavailable, see note | 10% |
| AI Search Readiness (GEO) | 65/100 | 10% |
| Images | 85/100 | 5% |

Performance category is scored on the un-weighted remainder (69/100 average of the other six) since PageSpeed Insights lab data could not be fetched in this session (public, keyless PSI quota was rate-limited: "240 QPM / 25,000 QPD" shared-IP limit). No Google Search Console / CrUX / GA4 credentials are configured (`google_auth.py --check` found none), so field data and indexation status are also unavailable this run.

## Executive Summary

**Top 5 issues:**
1. **Critical — canonical/hreflang/sitemap all point to a redirecting host.** `astro.config.mjs:12` sets `site: 'https://runaway.money'` (no `www`), but Vercel's production domain redirects non-www → `www.runaway.money` (308, confirmed live). Every canonical tag, hreflang alternate, `og:url`, and the sitemap's URLs are therefore built from a URL that immediately redirects — the opposite of a clean self-referencing canonical.
2. **High — no security response headers.** Only HSTS is present (`strict-transport-security`). No CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy`. `vercel.json` only defines a cache-control rule for static assets — no `headers` block for security.
3. **Medium — SoftwareApplication schema misstates pricing.** `MarketingLayout.astro:46` hardcodes `offers: { price: '0', priceCurrency: 'USD' }` even though the product has a paid Premium tier (Monte Carlo simulation, per the homepage FAQ). Structured data should not assert a single flat price for a freemium product.
4. **Medium — no freshness/authorship signal on tax- and methodology-sensitive content.** `/methodologie` and `/en/methodology` explain how tax and inflation assumptions are modeled but carry no visible "last reviewed" date or author credential — a real E-E-A-T gap for financial-projection content, where staleness (e.g. an outdated tax rule) is a credibility risk.
5. **Low/Info — FAQPage schema present on homepage.** Per current guidance, Google retired FAQ rich results for all sites (May 7, 2026), so this schema has no SERP feature benefit anymore. Not a penalty risk — keep it for AI/LLM citation value (ChatGPT/Perplexity/AI Overviews can still use FAQ markup as a citability signal) — just don't expect a SERP rich result from it, and don't add more FAQPage blocks expecting one.

**Quick wins (all low-effort, high-signal):**
- Fix `site:` in `astro.config.mjs` to `https://www.runaway.money` — cascades correctly to canonical, hreflang, `og:url`, and sitemap in one change (root cause of finding #1).
- Add a `headers` block to `vercel.json` for baseline security headers (CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- Change the `Offer` schema to reflect a free tier without asserting a fixed price for the whole product (e.g. drop `offers` or use `AggregateOffer`/`priceSpecification` reflecting free + paid).
- Add a visible "last reviewed" date to `/methodologie` (both locales).

## Technical SEO

- **Crawlability:** `robots.txt` is sane (`Allow: /`, disallows `/app/`, `/*/app/`, `/api/` — correctly hides the authenticated product from crawlers). But it declares `Sitemap: https://runaway.money/sitemap-index.xml` — the same non-www host that 308-redirects. Crawlers generally follow the redirect fine, but it's the same root-cause issue as the canonical mismatch and should be fixed alongside it.
- **Canonicalization:** See Critical finding above. This is systemic — verified on all 8 crawled URLs, all pointing to `runaway.money/...` instead of `www.runaway.money/...`.
- **Indexability:** `<meta name="robots" content="index, follow, max-image-preview:large">` present and correct on all pages checked. No noindex leaks found on marketing pages.
- **HTTPS/redirects:** HSTS enabled (`max-age=63072000`), non-www → www redirect is a clean single-hop 308. Good.
- **Security headers:** Missing CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy. Confirmed absent in both live response headers and `vercel.json` (only a `Cache-Control` header rule exists there).
- **Sitemap:** Valid sitemap index → single sitemap file, 8 URLs, `lastmod` present. Generated via `@astrojs/sitemap` (confirmed in `astro.config.mjs`). No orphaned or missing marketing pages found relative to the site's actual page count.

## Content Quality (E-E-A-T)

- `/methodologie` (~590 words) and `/a-propos` (~540 words) are well-structured with clear H2/H3 hierarchy, cover assumptions/sources/limitations ("Ce que le modèle ne peut pas savoir" section is a good trust-building limitation disclosure), and explain the product is not licensed financial advice (also stated in the homepage FAQ) — appropriate disclaimer for YMYL-adjacent content.
- Gap: no author byline, credentials, or last-updated date anywhere in the checked pages. For a solo-developer finance tool, a short "who built this and why" credential note (beyond the general About page mission copy) plus a visible review date on the methodology page would meaningfully strengthen E-E-A-T for YMYL-adjacent financial content.
- No blog or long-form educational content exists yet, so there's no thin-content or duplicate-content risk today, but also no organic long-tail acquisition surface beyond the 8 core pages.

## On-Page SEO

- Titles and meta descriptions are present, unique, and reasonably lengthed on every page checked, in both `fr` and `en`.
- H1s are unique per page and descriptive (not the brand name, which is good — they describe user outcomes: *"Votre patrimoine peut-il financer la vie que vous voulez ?"*).
- Heading structure is clean (no skipped levels observed).
- hreflang is implemented correctly in structure (`fr`, `en`, `x-default`) — just needs the host fixed (see Critical finding).

## Schema & Structured Data

- Present: `Organization`, `SoftwareApplication` (homepage only, both locales), `FAQPage` (homepage only), `WebPage` (interior pages).
- Issues: `Offer.price: "0"` inaccurately represents a freemium product with a paid Premium tier (see Medium finding above). `FAQPage` has no SERP benefit post-May-2026 retirement but is fine to keep for AI citability — don't expand it further expecting a rich result.
- No `BreadcrumbList` schema — minor opportunity given the site has clear section hierarchy (home → about/methodology/contact, each in 2 locales).

## Performance

Not measured with lab data this run (PSI keyless rate limit hit; no CrUX/GSC credentials configured). Directional signal from resource inspection: the homepage's own JS entry chunk (`/_astro/page.BvRk9kiK.js`) is a 0-byte stub (Astro island hydration marker — the interactive app itself is excluded from the marketing pages and lives under `/app`, correctly gated by `robots.txt`), and the marketing CSS bundle is ~24KB. This suggests a light marketing-page footprint, but this should be confirmed with an authenticated PageSpeed Insights or CrUX run rather than assumed.

## AI Search Readiness (GEO)

- No `llms.txt` at the root (404). Given the FAQ schema already signals intent to be AI-citable, adding an `llms.txt` describing the product, methodology, and disclaimer would reinforce that.
- Content answers direct questions well (FAQ format, clear methodology breakdown) — good raw material for AI Overviews/LLM citation once the canonical-host issue no longer sends conflicting URL signals.

## Images

- Hero product screenshot has descriptive alt text (`"Tableau de bord réel de l'application Runaway"`) with responsive `srcset`. Decorative icons (favicon repeats) correctly use empty `alt=""`. No issues found in the pages sampled.

## Backlinks

Common Crawl web-graph lookup did not return data within this session's time budget (likely a young/small domain with limited external link graph so far). No Moz/Bing Webmaster credentials configured for DA/PA. Recommend re-running `scripts/commoncrawl_graph.py runaway.money` with more time, or configuring Moz, once there's a link-building push to measure against (e.g. Product Hunt launch, personal-finance community mentions, indie-hacker directories).

## Search Experience (SXO)

The site's page types match intent well for a solo-dev SaaS: homepage sells the outcome, methodology page satisfies the "can I trust this math" query intent that a finance tool inevitably attracts, About page covers the "who made this" trust query. No page-type mismatch detected. The main growth constraint isn't page-type — it's the lack of any content surface beyond these 8 core pages to capture top-of-funnel queries (e.g. "when can I retire", "FIRE calculator", "how does inflation affect retirement savings").
