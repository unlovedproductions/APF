# Source 05 — Trustpilot Business Units API

- **Type:** primary (official API)
- **URL:** https://developers.trustpilot.com/business-units-api
- **Accessed:** 2026-08-12
- **Credibility:** 5 | **Recency:** 5 | **Bias:** 3
- **Maps to:** H1

## Verbatim quotes

> Get a business unit's reviews (paginate)… Use pageToken to paginate through reviews. This is a public endpoint and won't return customer emails or order IDs.

> URL: https://api.trustpilot.com/v1/business-units/{businessUnitId}/all-reviews

> Find a business unit… based on the domain name… `/v1/business-units/find`

## Relevance

Official review `text` bodies beat SPA HTML probes. Phase B collector: find BUID by domain/vendor → paginate reviews → upsert rich `product_review_sources`. Key required; not yet shipped in APF.
