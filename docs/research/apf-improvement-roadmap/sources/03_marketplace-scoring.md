# Source 03 — marketplace-scoring.mjs

- **URL/path:** scripts/marketplace-scoring.mjs
- **Type:** primary (code)
- **Accessed:** 2026-08-04
- **Credibility:** 5 | **Recency:** 5 | **Bias:** 3

## Verbatim quotes

> strategy: "digistore24_native_v1"
> note: "Digistore24 scorer emits APF-native recency/growth/competition/quality components."

> // Digistore24 imports are fresh if they were just collected or refreshed.
> const recency = 20;

> quality uses affiliate readiness + description length + confidence_score / source_count / vendor_trust_score
> — no refund-rate or promote-outcome label in score components.

## Relevance

Supports H2: Digistore scorer is heuristic over marketplace-visible fields + enrichment confidence circularity risk (confidence feeds quality). ClickBank path can passthrough native components or fallback without refunds.
