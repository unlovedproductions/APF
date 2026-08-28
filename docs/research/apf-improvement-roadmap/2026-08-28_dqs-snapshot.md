# Digistore enrichment DQS snapshot — 2026-08-28

**N:** 11 Digistore briefs (limit 11)  
**DQS estimate:** **93 / 100** (directional hygiene; not faithfulness)  
**Video-claim gate:** PASS (high-trust rich ≥70% OR all rich ≥60%)

| Metric | Value |
|--------|------:|
| complete | 10 (90.9%) |
| complete_degraded | 1 (9.1%) |
| products.name marketplace brand | 0 (0%) |
| affiliate chrome in summary | 0 |
| affiliate chrome in complaints | 0 |
| affiliate chrome in claims | 1 |
| synthetic competitors | 0 |
| avg confidence | 52.1 |
| sources rich (all) | 488 / 670 (72.8%) |
| sources rich (high-trust) | 339 / 347 (97.7%) |
| sources rich (deep, excl snippet_fallback) | 270 / 452 (59.7%) |
| soft-pruned excluded | 367 |

### Faithfulness KPIs (beside DQS)

| KPI | Value |
|-----|------:|
| competitor_empty_rate | 27.3% |
| competitor_price_fill_rate | 0% |
| substantive_independent_rate | 100% |
| grounded_signal_rate | 3.3% (1/30) |
| entity_mismatch_rate | 55.6% (193/347) |
| buyer_price_mismatch_rate | 85.7% (6/7) |

```json
{
  "sampled_at": "2026-08-28T18:56:49.776Z",
  "digistore_briefs_n": 11,
  "status_counts": {
    "complete": 10,
    "complete_degraded": 1
  },
  "complete_pct": 90.9,
  "degraded_pct": 9.1,
  "marketplace_brand_name_pct": 0,
  "affiliate_chrome_summary": 0,
  "affiliate_chrome_complaints": 0,
  "affiliate_chrome_claims": 1,
  "synthetic_competitors": 0,
  "avg_confidence": 52.1,
  "sources_total": 670,
  "sources_rich_content_text": 488,
  "sources_rich_pct": 72.8,
  "sources_rich_pct_all": 72.8,
  "sources_high_trust_total": 347,
  "sources_high_trust_rich": 339,
  "sources_rich_pct_high_trust": 97.7,
  "sources_deep_total": 452,
  "sources_deep_rich": 270,
  "sources_rich_pct_deep": 59.7,
  "sources_pruned_excluded": 367,
  "video_claim_gate": true,
  "dqs_estimate": 93,
  "competitor_empty_rate": 27.3,
  "competitor_price_fill_rate": 0,
  "substantive_independent_rate": 100,
  "grounded_signal_rate": 3.3,
  "grounded_signal_lines": 1,
  "signal_lines_total": 30,
  "entity_mismatch_rate": 55.6,
  "entity_review_sources": 347,
  "entity_mismatch_sources": 193,
  "buyer_price_mismatch_rate": 85.7,
  "buyer_price_checked": 7,
  "buyer_price_mismatch": 6
}
```

**Next:** Prefer `pnpm review:prune-thin` then `review:backfill-content` over bulk `review:once`. Video-claim gate: high-trust rich ≥70% or all rich ≥60%. Re-check faithfulness KPIs after quote-ground / entity-lock ships.
