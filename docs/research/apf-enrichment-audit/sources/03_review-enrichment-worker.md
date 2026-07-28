# Source 03 — scripts/review-enrichment-worker.mjs

- **Type:** primary (code)
- **Credibility:** 5

## Critical mechanism — coverage merge order

```js
const coverage = brief.evidence_coverage && typeof brief.evidence_coverage === "object"
  ? {
      ...evidenceCoverageFromSources(sources, { ... }),
      ...brief.evidence_coverage,  // LLM wins
      resolved_product_name: product.name || brief.evidence_coverage.resolved_product_name || "",
    }
  : evidenceCoverageFromSources(...);
```

Confidence caps and `complete_degraded` read this merged object — LLM booleans can bypass server gates.

## Other gates present

- Digistore identity unresolved → confidence ≤25, degrade path
- No independent + no vendor → confidence ≤40, force degrade
- Digistore no independent → confidence ≤55
- `stripAffiliateMetaLines` on signal arrays only (not `review_summary`)
- `searchSuspensionSeen` logged but does not force degrade
- Prompt load: file template with INLINE_PROMPTS fallback (drift risk)

## Tests

Unit tests cover coerce / page-fetch / trust helpers. **No `finalizeBrief` / `processJob` tests.**
