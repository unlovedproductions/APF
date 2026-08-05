# Source 02 — Prior F3 zero content_text

- **Type:** primary (prior finding)
- **Credibility:** 5
- **Location:** `docs/research/apf-enrichment-audit/findings/F3_zero-content-text.md`
- **Maps to:** H2

## Verbatim

> **Thesis:** Despite `enrichHighTrustSources`, live sources have 0/218 `content_text` fields — LLM still works from snippets only.

> **Status:** Confirmed (mechanism under-determined: fail vs persist bug)

## Notes

Post-audit page-fetch + backfill moved the catalog to 41.5% rich. Mechanism is no longer “zero persist”; remaining gap is dilution + fetch budget.
