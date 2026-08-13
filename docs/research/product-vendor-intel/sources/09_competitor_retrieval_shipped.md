# Source 09 — Competitor retrieval (shipped code)

- **Type:** primary (code)
- **Paths:** `scripts/enrichment-source-trust.mjs` (`competitorEvidenceQueries`, `extractCompetitorCandidatesFromHits`, `normalizeSuggestedCompetitors`), `scripts/enrichment-brief-finalize.mjs`
- **Accessed:** 2026-08-12
- **Credibility:** 5 | **Recency:** 5 | **Bias:** 4
- **Maps to:** H2

## Behavior

Dedicated vs/alternative/or SERP queries; regex extract from titles/snippets; vendor compare copy; same-platform catalog names; LLM must pick from candidates; no Top/Popular/Budget synthetic fill; `<2` competitors demotes `vs_battle`/`elimination`.

## Relevance

Baseline for H2: paid spy SaaS must beat *this* path, not 2024 LLM-invented names. Empty-candidate rate and competitor *prices* remain residual.
