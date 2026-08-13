# Source 08 — sanitizeBuyerPrice + refresh script

- **Type:** primary (code)
- **Paths:** `scripts/digistore24-detail-extractor.mjs`, `scripts/refresh-digistore-buyer-prices.mjs`, `scripts/enrichment-brief-finalize.mjs`
- **Accessed:** 2026-08-12
- **Credibility:** 5 | **Recency:** 5 | **Bias:** 4
- **Maps to:** H3

## Verbatim quotes / behavior

`sanitizeBuyerPrice` rejects affiliate markers (epc, commission, …) and long marketing; accepts short buyer prices / Free / Varies / See official offer page; falls back to `cartValue`.

`finalizeBrief` always runs sanitize on `price_display`.

`refresh-digistore-buyer-prices.mjs` re-extracts from `product_vendor_materials` structured pricing when brief price is wrong.

## Relevance

Buyer-price quarantine for *subject* product is largely shipped. Open gap = competitor offer prices for `price_comparison` / vs scripts — not Amazon Keepa.
