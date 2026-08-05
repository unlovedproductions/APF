# Source 00 — Internal enrichment pipeline

- **Type:** primary (code)
- **Credibility:** 5
- **Location:** `scripts/enrichment-page-fetch.mjs`, `scripts/review-enrichment-worker.mjs`
- **Maps to:** H1, H2, Way 1–2

## Verbatim / constants

From `review-enrichment-worker.mjs`:

- `REVIEW_ENRICHMENT_MAX_SOURCES` default **25**
- `REVIEW_ENRICHMENT_FULL_PAGE_LIMIT` default **10**
- `REVIEW_ENRICHMENT_FULL_PAGE_MAX_ATTEMPTS` default `limit * 3` (**30**)
- Fetch success gate: `content_text.trim().length >= 80`
- DQS rich gate (separate): `CHAR_LENGTH(content_text) >= 50`

From `enrichment-page-fetch.mjs`:

```
const FETCHABLE_TIERS = new Set(["review", "scam_advisor", "retailer", "video"]);
```

Fill order in `enrichSourceContent`: cache → YouTube transcript → local Cheerio → Firecrawl scrape → snippet_fallback (≥80).

## Notes

- `INSERT … ON DUPLICATE KEY UPDATE` on `(product_id, url)` — **no DELETE** of thin orphans.
- Digistore catalog post-backfill: ~905 sources / 11 products ≈ **82 sources/SKU**.
