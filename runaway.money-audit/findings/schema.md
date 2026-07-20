# Schema & Structured Data Findings — runaway.money

Source: `src/layouts/MarketingLayout.astro:30-63`. Present: Organization, SoftwareApplication (homepage only), FAQPage (homepage only), WebPage (interior pages). All valid JSON-LD.

## Medium: SoftwareApplication Offer misstates pricing
`offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }` hardcoded even though the product has a paid Premium tier (Monte Carlo simulation, per homepage FAQ).
**Fix:** drop `offers` or model as AggregateOffer reflecting free + Premium.

## Info: FAQPage has no SERP benefit anymore
Google retired FAQ rich results for all sites May 7, 2026. Existing FAQPage markup won't produce a rich result but remains a useful AI/LLM citation signal — keep it, don't expect SERP feature, don't add more expecting one.

## Opportunity
No BreadcrumbList schema — minor, given clear site hierarchy (home → about/methodology/contact × 2 locales).
