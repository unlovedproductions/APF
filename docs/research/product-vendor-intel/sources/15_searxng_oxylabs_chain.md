# Source 15 — Search chain (SearXNG + Oxylabs fallback)

- **Type:** primary (code/env)
- **Paths:** `scripts/review-enrichment-worker.mjs`, `scripts/enrichment-oxylabs.mjs`
- **Accessed:** 2026-08-12
- **Credibility:** 5 | **Recency:** 5 | **Bias:** 4
- **Maps to:** H4

## Behavior

`REVIEW_ENRICHMENT_PROVIDER` default `searxng`; Brave API optional; Firecrawl search on RL/miss; Oxylabs `google_search` last resort with `OXYLABS_USERNAME`/`PASSWORD` BYOK caps.

## Relevance

SERP discovery is already multi-provider resilient. Wave E catalog re-enrich flake is operational (engine cooldown), not a reason to buy Bright Data wholesale.
