# Digistore enrichment DQS snapshot — 2026-08-05

**N:** 11 Digistore briefs (limit 50)  
**DQS estimate:** **97 / 100** (directional; not full audit re-score)  
**Video-claim gate:** PASS (high-trust rich ≥70% OR all rich ≥60%)

| Metric | Value |
|--------|------:|
| complete | 11 (100%) |
| complete_degraded | 0 (0%) |
| products.name marketplace brand | 0 (0%) |
| affiliate chrome in summary | 0 |
| affiliate chrome in complaints | 0 |
| affiliate chrome in claims | 0 |
| synthetic competitors | 0 |
| avg confidence | 60.5 |
| sources rich (all) | 434 / 888 (48.9%) |
| sources rich (high-trust) | 323 / 334 (96.7%) |
| sources rich (deep, excl snippet_fallback) | 218 / 672 (32.4%) |
| soft-pruned excluded | 17 |

```json
{
  "sampled_at": "2026-08-05T14:57:34.564Z",
  "digistore_briefs_n": 11,
  "status_counts": {
    "complete": 11
  },
  "complete_pct": 100,
  "degraded_pct": 0,
  "marketplace_brand_name_pct": 0,
  "affiliate_chrome_summary": 0,
  "affiliate_chrome_complaints": 0,
  "affiliate_chrome_claims": 0,
  "synthetic_competitors": 0,
  "avg_confidence": 60.5,
  "sources_total": 888,
  "sources_rich_content_text": 434,
  "sources_rich_pct": 48.9,
  "sources_rich_pct_all": 48.9,
  "sources_high_trust_total": 334,
  "sources_high_trust_rich": 323,
  "sources_rich_pct_high_trust": 96.7,
  "sources_deep_total": 672,
  "sources_deep_rich": 218,
  "sources_rich_pct_deep": 32.4,
  "sources_pruned_excluded": 17,
  "video_claim_gate": true,
  "dqs_estimate": 97
}
```

**Next:** Prefer `pnpm review:prune-thin` then `review:backfill-content` over bulk `review:once`. Video-claim gate: high-trust rich ≥70% or all rich ≥60%.
