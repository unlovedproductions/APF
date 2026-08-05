# Digistore enrichment DQS snapshot — 2026-08-05

**N:** 10 Digistore briefs (limit 50)  
**DQS estimate:** **70 / 100** (directional; not full audit re-score)

| Metric | Value |
|--------|------:|
| complete | 1 (10%) |
| complete_degraded | 9 (90%) |
| products.name marketplace brand | 0 (0%) |
| affiliate chrome in summary | 0 |
| affiliate chrome in complaints | 0 |
| affiliate chrome in claims | 0 |
| synthetic competitors | 0 |
| avg confidence | 33 |
| sources with content_text≥50 | 38 / 588 (6.5%) |

```json
{
  "sampled_at": "2026-08-05T01:22:51.398Z",
  "digistore_briefs_n": 10,
  "status_counts": {
    "complete": 1,
    "complete_degraded": 9
  },
  "complete_pct": 10,
  "degraded_pct": 90,
  "marketplace_brand_name_pct": 0,
  "affiliate_chrome_summary": 0,
  "affiliate_chrome_complaints": 0,
  "affiliate_chrome_claims": 0,
  "synthetic_competitors": 0,
  "avg_confidence": 33,
  "sources_total": 588,
  "sources_rich_content_text": 38,
  "sources_rich_pct": 6.5,
  "dqs_estimate": 70
}
```

**Next:** If complete% stays near 0, keep search healthy then re-enrich one product at a time (§9). Do not declare production-ready until complete briefs dominate and affiliate chrome is near zero.
