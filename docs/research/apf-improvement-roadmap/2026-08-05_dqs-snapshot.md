# Digistore enrichment DQS snapshot — 2026-08-05

**N:** 11 Digistore briefs (limit 50)  
**DQS estimate:** **97 / 100** (directional; not full audit re-score)

| Metric | Value |
|--------|------:|
| complete | 11 (100%) |
| complete_degraded | 0 (0%) |
| products.name marketplace brand | 0 (0%) |
| affiliate chrome in summary | 0 |
| affiliate chrome in complaints | 0 |
| affiliate chrome in claims | 0 |
| synthetic competitors | 0 |
| avg confidence | 37.3 |
| sources with content_text≥50 | 85 / 758 (11.2%) |

```json
{
  "sampled_at": "2026-08-05T02:58:54.085Z",
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
  "avg_confidence": 37.3,
  "sources_total": 758,
  "sources_rich_content_text": 85,
  "sources_rich_pct": 11.2,
  "dqs_estimate": 97
}
```

**Next:** If complete% stays near 0, keep search healthy then re-enrich one product at a time (§9). Do not declare production-ready until complete briefs dominate and affiliate chrome is near zero.
