# Performance Findings — runaway.money

PageSpeed Insights (keyless) hit shared-IP rate limit ("240 QPM / 25,000 QPD") this session. No Search Console/CrUX/GA4 credentials configured (`google_auth.py --check` found none). Category not numerically scored this run.

Directional signal from resource inspection only:
- Homepage JS entry chunk (`/_astro/page.*.js`) is a 0-byte hydration stub — the interactive app is excluded from marketing pages, correctly gated behind `/app/` in robots.txt.
- Marketing CSS bundle ~24KB.

**Recommendation:** configure a PageSpeed Insights API key or Search Console access and re-run this category for real lab/field data before treating the above as conclusive.
