# Digistore enrichment DQS snapshot — 2026-08-05

**N:** 10 Digistore briefs (limit 50)  
**DQS estimate:** **67 / 100** (directional; not full audit re-score)

| Metric | Value |
|--------|------:|
| complete | 0 (0%) |
| complete_degraded | 10 (100%) |
| products.name marketplace brand | 0 (0%) |
| affiliate chrome in summary | 0 |
| affiliate chrome in complaints | 0 |
| affiliate chrome in claims | 0 |
| synthetic competitors | 0 |
| avg confidence | 33.5 |
| sources with content_text≥50 | 37 / 574 (6.4%) |

```json
{
  "sampled_at": "2026-08-05T01:06:15.430Z",
  "digistore_briefs_n": 10,
  "status_counts": {
    "complete_degraded": 10
  },
  "complete_pct": 0,
  "degraded_pct": 100,
  "marketplace_brand_name_pct": 0,
  "affiliate_chrome_summary": 0,
  "affiliate_chrome_complaints": 0,
  "affiliate_chrome_claims": 0,
  "synthetic_competitors": 0,
  "avg_confidence": 33.5,
  "sources_total": 574,
  "sources_rich_content_text": 37,
  "sources_rich_pct": 6.4,
  "dqs_estimate": 67
}
```

**Next:** If complete% stays near 0, keep search healthy then re-enrich one product at a time (§9). Do not declare production-ready until complete briefs dominate and affiliate chrome is near zero.
