# Source 01 — Live MySQL enrichment DQS snapshot

- **Type:** primary (production-local DB)
- **Date sampled:** 2026-07-28
- **Credibility / Recency / Bias:** 5 / 5 / 0
- **Scope:** `product_review_briefs` (n=10), `product_review_sources` (n=218), `review_enrichment_jobs` (n=10), Digistore `products` (n=10)

## Verbatim aggregates

- Briefs: 1 `complete`, 9 `complete_degraded`
- Jobs: 10 `complete`, 0 stale running, 0 failed (7d)
- Null profile: 0 empty summaries, 0 null confidence, 0 null coverage, 0 empty price
- Confidence bins: 1× 0–24 (score 3), 8× 55–69 (all 55), 1× 70–84 (score 82)
- Digistore products still named `Digistore24`: **10/10**
- Brief `resolved_product_name` non-marketplace: **10/10**
- EPC/commission in `price_display`: **0**
- Synthetic “Top … alternative” competitors: **0**
- Affiliate regex hits: positive_signals 0; common_complaints 2; common_claims 2
- `raw_json.content_text` present: **0 / 218**
- Distinct URLs: 48 across 218 rows; 28 cross-product URL reuse groups; 0 duplicate (product_id, url)
- Freshness: all 10 briefs within last 7 days (oldest 2026-07-26)

## Sample narrative failures (verbatim heads)

- Product 1 (`Joseph’s Well…`): summary `"Trust us, it's for everyone's benefit."`, confidence 82, `has_independent_review=true`
- Product 3 (`The Genius Wave`): summary starts with keyword-bidding compliance rules
- Product 4 (`Medicinal Garden Kit`): summary `"If you do, you will not get paid any commissions."`
- Product 8 (`Primal Grow Pro`): complaints include commission/EPC affiliate marketing copy
- Product 9 (`CircO2`): summary `"Skip to content Digistore24 Promote…"`

## Scores contribution

Drives DQS Validity/Consistency; confirms H1 (partial), H2, H3.
