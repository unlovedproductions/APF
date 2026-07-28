# Refresh targets

Re-run these without full re-investigation:

| Entity | Metric | Trigger |
|--------|--------|---------|
| `product_review_briefs` | % `complete_degraded`, conf bins, affiliate regex on summary/complaints | After finalizeBrief / strip fixes |
| `product_review_sources` | % with `content_text` length >50 | After page-fetch persist fix |
| `products` Digistore | % name still marketplace brand | After persist-name / requeue |
| `finalizeBrief` | LLM cannot set has_independent_review | Code review / unit test |
| Adversarial criticals | coverage override, prompt fencing, SSRF rebinding | After security slice |
| External | RAG abstention / faithfulness practice | Quarterly if redesigning gates |

**Update command intent:** `update apf-enrichment-audit` → delta SQL + adversarial re-check of changed files only.
