# Action Plan — runaway.money

## Phase 1: Critical Fixes (this week)

1. **Fix the canonical/hreflang/sitemap host mismatch.**
   Change [astro.config.mjs:12](astro.config.mjs:12) from `site: 'https://runaway.money'` to `site: 'https://www.runaway.money'`.
   - Dependency: none — this is a single-line root-cause fix. It automatically corrects `canonical`, `hreflang` alternates, `og:url`, and the generated sitemap because they all derive from `Astro.site` in [src/layouts/MarketingLayout.astro](src/layouts/MarketingLayout.astro:28-77).
   - Also update `Sitemap:` line in `public/robots.txt` to the `www` host.
   - **How would we know this failed?** Re-crawl the 8 pages; every `<link rel="canonical">` and `hreflang` href must resolve to `www.runaway.money` and return 200 directly (no redirect hop).
   - **Leading indicator to monitor:** Search Console (once connected) "Duplicate, Google chose different canonical" count for this property should drop to 0 for these URLs.

## Phase 2: High-Impact Improvements (weeks 2-3)

2. **Add baseline security headers.**
   Add a `headers` block to [vercel.json](vercel.json) covering the marketing routes: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. Scope CSP carefully since the app itself (`/app/*`) may have different script/style needs than the marketing pages.
   - Dependency: coordinate with whatever CSP the `/app` SPA already assumes, if any, to avoid breaking auth/session flows.
   - **How would we know this failed?** `curl -sI` on both a marketing page and `/app` shows the new headers with no console CSP violations on either surface.

3. **Correct the SoftwareApplication `Offer` schema.**
   In [src/layouts/MarketingLayout.astro:46](src/layouts/MarketingLayout.astro:46), stop asserting a single `price: '0'` for a product that has a paid Premium tier. Either drop `offers` entirely or model it as an `AggregateOffer` / list of `Offer`s reflecting free + Premium pricing.
   - **How would we know this failed?** Validate with Google's Rich Results Test / schema.org validator — no price-mismatch warnings.

## Phase 3: Content & Authority (month 2)

4. **Add a "last reviewed" date and light author credential to `/methodologie` and `/en/methodology`.**
   Financial/tax assumptions change yearly; a visible review date is both an E-E-A-T signal and a real trust cue for a YMYL-adjacent tool.
   - **Leading indicator:** track this page's organic impressions/CTR once GSC is connected — methodology/trust pages often see CTR lift from visible freshness cues.

5. **Add `llms.txt`** describing the product, the methodology page, and the "not financial advice" disclaimer, since the FAQ schema already signals AI-citability intent.

6. **Plan a content surface beyond the 8 core pages** (e.g. a short-form glossary or FAQ-driven article set targeting "when can I retire" / FIRE-calculator queries) once the above technical fixes have landed — no point building topical content on top of an unresolved canonical signal.

## Phase 4: Monitoring & Iteration (ongoing)

7. Configure Google Search Console + a PageSpeed Insights API key (or GSC/CrUX access) so future audits get field data and real indexation status instead of the keyless-quota estimate used here.
8. Re-run `scripts/commoncrawl_graph.py runaway.money` periodically to track backlink graph growth as launch/marketing activity picks up.
9. Capture a drift baseline now (`scripts/drift_baseline.py`) against `www.runaway.money` so the next audit can diff against today's state, especially to confirm the canonical fix stuck.
