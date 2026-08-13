# Source 21 — Vendor materials as price source

- **Type:** primary (code)
- **Paths:** `scripts/digistore24-vendor-materials.mjs`, `scripts/refresh-digistore-buyer-prices.mjs`
- **Accessed:** 2026-08-12
- **Credibility:** 5 | **Recency:** 5 | **Bias:** 4
- **Maps to:** H3

## Behavior

Vendor offer/order materials store titles and `structured_blocks.pricing[]`. Refresh job extracts buyer prices from materials when brief price is affiliate junk.

## Relevance

Subject-product pricing pipeline: marketplace cart + vendor page extraction — not retail price APIs. Competitor price gap = apply same extraction to *rival* offer pages after competitor names resolve.
