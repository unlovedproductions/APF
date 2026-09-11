# Digistore enrichment DQS snapshot — 2026-09-08

**N:** 10 Digistore briefs (limit 11)  
**DQS estimate:** **95 / 100** (directional hygiene; not faithfulness)  
**Video-claim gate:** FAIL (high-trust rich ≥70% OR all rich ≥60%)

| Metric | Value |
|--------|------:|
| complete | 10 (100%) |
| complete_degraded | 0 (0%) |
| products.name marketplace brand | 0 (0%) |
| affiliate chrome in summary | 0 |
| affiliate chrome in complaints | 0 |
| affiliate chrome in claims | 1 |
| synthetic competitors | 0 |
| avg confidence | 41 |
| sources rich (all) | 117 / 722 (16.2%) |
| sources rich (high-trust) | 87 / 366 (23.8%) |
| sources rich (deep, excl snippet_fallback) | 109 / 714 (15.3%) |
| soft-pruned excluded | 0 |

### Faithfulness KPIs (beside DQS)

| KPI | Value |
|-----|------:|
| competitor_empty_rate | 50% |
| competitor_price_fill_rate | n/a (rivals are name-only) |
| substantive_independent_rate | 100% |
| grounded_signal_rate | 100% (1/1) |
| entity_mismatch_rate | 61.6% (217/352) |
| buyer_price_mismatch_rate | 0% (0/5) |

```json
{
  "sampled_at": "2026-09-08T05:51:52.598Z",
  "digistore_briefs_n": 10,
  "status_counts": {
    "complete": 10
  },
  "complete_pct": 100,
  "degraded_pct": 0,
  "marketplace_brand_name_pct": 0,
  "affiliate_chrome_summary": 0,
  "affiliate_chrome_complaints": 0,
  "affiliate_chrome_claims": 1,
  "synthetic_competitors": 0,
  "avg_confidence": 41,
  "sources_total": 722,
  "sources_rich_content_text": 117,
  "sources_rich_pct": 16.2,
  "sources_rich_pct_all": 16.2,
  "sources_high_trust_total": 366,
  "sources_high_trust_rich": 87,
  "sources_rich_pct_high_trust": 23.8,
  "sources_deep_total": 714,
  "sources_deep_rich": 109,
  "sources_rich_pct_deep": 15.3,
  "sources_pruned_excluded": 0,
  "video_claim_gate": false,
  "dqs_estimate": 95,
  "competitor_empty_rate": 50,
  "competitor_price_fill_rate": null,
  "substantive_independent_rate": 100,
  "grounded_signal_rate": 100,
  "grounded_signal_lines": 1,
  "signal_lines_total": 1,
  "entity_mismatch_rate": 61.6,
  "entity_review_sources": 352,
  "entity_mismatch_sources": 217,
  "buyer_price_mismatch_rate": 0,
  "buyer_price_checked": 5,
  "buyer_price_mismatch": 0
}
```

**Next:** Prefer `pnpm review:prune-thin` then `review:backfill-content` over bulk `review:once`. Video-claim gate: high-trust rich ≥70% or all rich ≥60%. Re-check faithfulness KPIs after quote-ground / entity-lock ships.
