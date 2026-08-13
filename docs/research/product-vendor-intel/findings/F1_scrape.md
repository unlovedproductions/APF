# F1 — Product / vendor scrape methods

**Thesis (H4):** For Digistore/ClickBank info products, scrape quality is gated by identity resolution + existing fetch ladder + host trust — not by swapping Firecrawl for Bright Data / Extralt / Apify.

**Evidence:** [00](../sources/00_capability_discovery.md), [01](../sources/01_evidence_depth_decision.md), [03](../sources/03_firecrawl_docs.md), [04](../sources/04_jina_reader_prior.md), [15](../sources/15_searxng_oxylabs_chain.md), [17](../sources/17_bright_data_vs_firecrawl.md), [21](../sources/21_vendor_materials_price.md)

**Types:** primary + vendor + industry (biased opposition) — triangulation OK.

## Verdict

**Confirm H4.**

## What works today

1. **SERP:** SearXNG → Brave API → Firecrawl search → Oxylabs ([00](../sources/00_capability_discovery.md), [15](../sources/15_searxng_oxylabs_chain.md)).
2. **Bodies:** local → Playwright Stealth → Jina → Firecrawl markdown ([00](../sources/00_capability_discovery.md), [03](../sources/03_firecrawl_docs.md), [04](../sources/04_jina_reader_prior.md)).
3. **Vendor claims/price copy:** DB `vendor_materials` from Digistore offer/order pages ([21](../sources/21_vendor_materials_price.md)).

## Better methods (ranked)

| Rank | Method | Cost | Why |
|------|--------|------|-----|
| 1 | Keep identity resolve before enrich | $0 | Wrong name → every scrape targets marketplace chrome (prior roadmap) |
| 2 | Raise full-page / Firecrawl scrape budget on thin probes | BYOK | Way 2 from [01](../sources/01_evidence_depth_decision.md) |
| 3 | Prefer structured vendor materials over re-scraping hop links | $0 | Already stored ([21](../sources/21_vendor_materials_price.md)) |
| 4 | Optional Bright Data / Apify | Paid | Only if Stealth+Jina+Firecrawl success collapses — not evidenced ([17](../sources/17_bright_data_vs_firecrawl.md)) |

## Do not build

- Extralt / Amazon-SKU enrichment platforms as Digistore primary
- Wholesale scraper-vendor swap without measuring ladder failure rates
- Landing-page ripper SaaS as substitute for claim/review split

## Residual gap

SPA review hosts still thin after local fetch — escalate those URLs harder; do not invent praises from titles ([01](../sources/01_evidence_depth_decision.md)).
