# Refresh targets — product-vendor-intel

Re-run without full re-investigation (`update product-vendor-intel`):

| Entity | Metric / watch | Trigger |
|--------|----------------|---------|
| Trustpilot API | Key issued? BUID find + all-reviews pagination works? | Before Phase B ship |
| Probe rich rate | Digistore `direct_probe` rows with `content_text`≥200 | After Phase A |
| YT transcript fill | % video-tier sources with transcript ≥200 chars | After transcript harden |
| Reddit JSON fill | % reddit sources with comment body text | After JSON path harden |
| Competitor empty rate | Jobs with `suggested_competitors` length 0 after finalize | Monthly / after query tweak |
| Competitor price fill | % candidates with sanitized rival `price_display` | After competitor-price ship |
| Sitejabber trust score | Host tier weight post-FTC demotion | After trust patch |
| Firecrawl/Oxylabs/Brave | BYOK balance + RL rate | Monthly |
| Docs drift | `enrichment-improvements.md` §3 vs code | After any competitor change |
| H1–H4 | Re-verdict if Trustpilot live 14d or spy SaaS trial | After Phase B or paid pilot |
| Adversarial | Briefs still claim-thin / EPC price / synthetic comps? | After any intel ship |
| Related DQS | Digistore rich% / high-trust rich% | Link `evidence-depth-levers` refresh |

**Related:**  
- `docs/research/evidence-depth-levers/refresh_targets.md`  
- `docs/research/apf-enrichment-audit/refresh_targets.md`  
- `docs/enrichment-improvements.md`
