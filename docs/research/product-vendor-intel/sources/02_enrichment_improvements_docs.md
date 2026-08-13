# Source 02 — enrichment-improvements.md (spec vs ship)

- **Type:** primary (internal docs)
- **Path:** `docs/enrichment-improvements.md`
- **Accessed:** 2026-08-12
- **Credibility:** 4 | **Recency:** 4 | **Bias:** 3
- **Maps to:** H2, H3, docs drift

## Verbatim quotes

> Competitors are LLM-only. `normalizeSuggestedCompetitors` falls back to synthetic names: `Top ${category} alternative` …

> Accept only short buyer prices… Reject strings containing: `epc`, `commission`…

## Relevance / caveat

Docs §3 still describes pre-ship competitor problem. Live code (2026-08-12 map) already removes synthetic fallback and constrains LLM to candidates. Treat docs as partially stale; do not reopen “build competitor retrieval” as greenfield.
