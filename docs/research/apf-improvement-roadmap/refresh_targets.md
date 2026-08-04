# Refresh targets

Re-run without full re-investigation (`update apf-improvement-roadmap`):

| Entity | Metric / watch | Trigger |
|--------|----------------|---------|
| SearXNG / Brave | `engines=brave` probe success rate; rate-limit strikes | After search infra change |
| `product_review_briefs` Digistore | % `complete` vs `complete_degraded`; avg confidence; affiliate chrome regex | After P0.2–P0.4 |
| `products.name` Digistore | % still marketplace brand | After persist-name |
| Enrichment System Score | Recompute vs 56 baseline | After live DQS |
| `digistore24_native_v1` | Uses refund/cancel fields? | After P1.1 |
| Competitors | New Digistore+ClickBank AI research tools | Quarterly |
| Hypotheses | H1 if APF sold standalone; H4 if daemon outages rise | Product strategy change |
| Adversarial | Export still ships hollow narratives? | After export gate |

**Related:** `docs/research/apf-enrichment-audit/refresh_targets.md` for enrichment-only delta.
