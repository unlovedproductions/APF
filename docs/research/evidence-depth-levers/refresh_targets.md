# Refresh targets — evidence-depth-levers

Re-run without full re-investigation (`update evidence-depth-levers`):

| Entity | Metric / watch | Trigger |
|--------|----------------|---------|
| Digistore DQS | `sources_rich_pct`, avg conf, sources_total | After prune or backfill |
| High-trust rich% | New DQS columns when Way 1 ships | After DQS split |
| Deep rich% | Exclude `snippet_fallback` | After metric change |
| `FULL_PAGE_SOURCE_LIMIT` | Code default vs env | After worker change |
| `FIRECRAWL_MAX_SCRAPE_PER_JOB` | Default 3 vs depth 15 | After Firecrawl spend |
| Firecrawl pricing / credits | Remaining BYOK balance | Monthly / after depth runs |
| Trustpilot API access | Key issued? Business Units pagination works? | Before Way 3 Phase B |
| `TRANSCRIPT_API_KEY` / YT caption success rate | % video sources with content_text≥200 | After transcript harden |
| Thin orphan count | Digistore sources with content_text&lt;50 | After each enrich wave |
| H1–H3 | Re-verdict if rich_all ≥60 sustained 14d | After Way 1+2 |
| Adversarial | Briefs still claim-thin / chrome / conf theater? | After any depth ship |

**Related:** `docs/research/apf-improvement-roadmap/2026-08-05_dqs-snapshot.md`, `docs/research/apf-enrichment-audit/refresh_targets.md`.
