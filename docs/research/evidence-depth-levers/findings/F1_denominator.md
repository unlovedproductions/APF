# F1 — Denominator surgery (H1 confirmed)

**Thesis:** Catalog rich% is capped primarily by thin SERP orphan accumulation, not by inability to fetch any page text.

**Evidence:** sources 00, 01, 06, 07, 10, 11, 12  
**Verdict:** **Confirm** for Digistore n=11 at 905 sources / 41.5% rich.

## Mechanism

1. Each `review:once` upserts up to `MAX_SOURCES=25` URLs; only ≤`FULL_PAGE_LIMIT=10` get rich fills.
2. No prune path — thin rows accumulate (~82/SKU).
3. Re-enrich while search is sick adds more thin rows → rich% can **fall**.

## Way 1 implementable spec — prune + high-trust DQS

### Prune rules (safe default)

Soft-delete candidates (prefer `archive` table or `raw_json.pruned_at` before hard DELETE):

| Condition | Action |
|-----------|--------|
| `CHAR_LENGTH(content_text) < 50` | Eligible thin |
| `discovered_at < NOW() - INTERVAL 14 DAY` | Aged enough |
| URL host tier is `web` (not review/scam/video/retailer) **OR** permanent `fetch_error` (404/410) | Prefer prune |
| URL is in last job’s enriched top set | **Never** prune |
| `source_type` competitor / needed for vs-battle | Retain even if thin (tag `retain_reason`) |

### Dry-run SQL (estimate)

```sql
-- Thin Digistore orphans (preview)
SELECT s.id, s.product_id, s.url,
  CHAR_LENGTH(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.content_text')), '')) AS text_len,
  s.discovered_at,
  JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.fetch_error')) AS fetch_error,
  JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.fetch_provider')) AS fetch_provider
FROM product_review_sources s
INNER JOIN products p ON p.id = s.product_id AND p.platform = 'digistore24'
WHERE CHAR_LENGTH(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.content_text')), '')) < 50
  AND s.discovered_at < (NOW() - INTERVAL 14 DAY)
ORDER BY s.product_id, s.id;
```

### Hard prune (only after dry-run + backup)

```sql
-- EXAMPLE — run only after dry-run counts reviewed
DELETE s FROM product_review_sources s
INNER JOIN products p ON p.id = s.product_id AND p.platform = 'digistore24'
WHERE CHAR_LENGTH(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.content_text')), '')) < 50
  AND s.discovered_at < (NOW() - INTERVAL 14 DAY)
  AND (
    JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.fetch_error')) REGEXP 'http 404|http 410'
    OR JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.fetch_provider')) IS NULL
  );
```

Prefer a script `scripts/prune-thin-review-sources.mjs --dry-run` that:

1. Classifies host via `classifySourceHost`
2. Skips `FETCHABLE_TIERS` unless permanent fetch error
3. Logs deleted IDs to `.data/prune-thin-YYYY-MM-DD.jsonl`
4. Never invents content

### Upsert policy (worker change — future code)

- Prefer writing only high-trust candidates + already-rich URLs into `product_review_sources`
- Cap generic `web` SERP upserts (e.g. max 5 of 25)

### High-trust DQS split

Extend `scripts/enrichment-dqs-report.mjs` to report:

| Metric | Definition |
|--------|------------|
| `sources_rich_pct_all` | content_text≥50 / all Digistore sources (current) |
| `sources_rich_pct_high_trust` | content_text≥50 among review/scam_advisor/video/retailer hosts |
| `sources_rich_pct_deep` | same as all **excluding** `fetch_provider=snippet_fallback` |

**Video-claim gate:** `sources_rich_pct_high_trust ≥ 70` **or** `sources_rich_pct_all ≥ 60`.

### Effort / risks

- Effort: small (script + DQS columns)
- Risk: over-prune vs-battle context — mitigate with retain tags
- Cost: $0

### Hypothesis status

**H1 confirmed.** Way 1 is the recommended first ship.
