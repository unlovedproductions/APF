# F2 — Numerator attack (H2 confirmed with limits)

**Thesis:** Raising fetch success on existing high-trust URLs (backfill + Firecrawl/Jina ladder) grows rich% without inventing claims — but alone cannot clear ≥60% while hundreds of thin orphans remain.

**Evidence:** sources 00, 01, 02, 03, 04, 05, 13  
**Verdict:** **Confirm mechanism**; **partial** as solo path to ≥60% catalog rich.

## Mechanism

- Local Cheerio fails on JS/WAF review hosts → empty/short text
- Firecrawl scrape budget default **3**/job — too low for 25 candidates
- `pnpm review:backfill-content` already proved no-SERP numerator growth (→41.5%)

## Way 2 implementable spec — fetch budgets + anti-dilution ops

### Env budgets (Digistore depth mode)

| Variable | Current default | Depth target | Notes |
|----------|----------------:|-------------:|-------|
| `FIRECRAWL_API_KEY` | unset | **set** | BYOK required for hard hosts |
| `REVIEW_ENRICHMENT_FIRECRAWL_MAX_SCRAPE_PER_JOB` | 3 | **15** | Digistore jobs only if possible |
| `REVIEW_ENRICHMENT_FIRECRAWL_MAX_SEARCH_PER_JOB` | 2 | 2 | Keep search budget flat |
| `REVIEW_ENRICHMENT_FULL_PAGE_LIMIT` | 10 | **20** | Only when search healthy |
| `REVIEW_ENRICHMENT_FULL_PAGE_MAX_ATTEMPTS` | 30 | **60** | `limit * 3` |
| `REVIEW_ENRICHMENT_MAX_SOURCES` | 25 | **20** or 25 | Prefer flat/lower — do not raise |
| `REVIEW_ENRICHMENT_FETCH_TIMEOUT_MS` | 8000 | 8000–12000 | Optional |
| `REVIEW_ENRICHMENT_FETCH_DELAY_MS` | 250 | 250–400 | Politeness |
| `TRANSCRIPT_API_KEY` | unset | **set** if available | YouTube ranked-0 depth |
| `REVIEW_ENRICHMENT_SEARCH_DELAY_MS` | 8000 | ≥10000 under RL | Anti thrash |

### Fetch ladder (credit-saving)

```
local Cheerio (≥80 chars)
  → Jina Reader GET https://r.jina.ai/{url}  (optional, no npm dep)
  → Firecrawl /v2 scrape markdown (BYOK, budgeted)
  → Browserless /content → extractMainText  (spend approval)
  → snippet_fallback (≥80)  — count as rich in DQS-all, EXCLUDE from DQS-deep
```

### Anti-dilution ops (mandatory)

1. **Prefer** `pnpm review:backfill-content --limit 40 [--product-id N]` over `review:once` for depth work.
2. **Ban** bulk `review:once` / daemon requeue while Brave/SearXNG rate-limited or cooldown file active.
3. After any full enrich job, run backfill on that product’s remaining thin high-trust URLs.
4. Remeasure with `pnpm review:dqs --write`; track both all% and deep%.

### Backfill ops recipe

```bash
# Healthy search not required — no SERP
pnpm review:backfill-content --limit 40 --delay-ms 300
pnpm review:dqs --write

# Per weak SKU
pnpm review:backfill-content --product-id 8 --limit 50
```

### When to combine with Way 1

If after two backfill passes rich_all &lt; 55% and thin orphans &gt; 400: **stop spending Firecrawl** and prune (Way 1) first.

### Effort / risks

- Effort: small–medium (env + optional Jina hook + ops discipline)
- Risk: snippet_fallback inflates rich% — use deep metric
- Cost: Firecrawl credits; Browserless only if approved

### Hypothesis status

**H2 confirmed** for numerator growth; **not sufficient alone** for sustainable ≥60% without prune or high-trust metric.
