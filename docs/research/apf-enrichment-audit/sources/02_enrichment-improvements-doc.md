# Source 02 — docs/enrichment-improvements.md

- **Type:** primary (project design doc)
- **Credibility / Recency / Bias:** 5 / 5 / 1 (authored as action plan; slightly optimistic on “done”)

## Key claims (paraphrase + quotes)

Doc lists Digistore failure modes: marketplace name, EPC-as-price, synthetic competitors, affiliate chrome as reviews.

Priority slices A–E: identity, price sanitize, competitors, trust+claim/review split, page fetch/YouTube, re-enrich, ShadowCast import defense.

## Implementation status vs code (2026-07-28)

| Doc § | Status in code |
|-------|----------------|
| §1 Identity resolve | Implemented (`resolveExportProductName`, persist name when resolved) |
| §2 Price sanitize | Implemented (`sanitizeBuyerPrice`) — live EPC price = 0 |
| §3 Competitors | Implemented (`normalizeSuggestedCompetitors`) — live synthetic = 0 |
| §4 Trust filters | Implemented (`classifySourceHost`, Digistore penalties) |
| §5 Claim/review split | Implemented in worker + prompts — **live narratives still fail** |
| §6 Full page fetch | Implemented module — **live `content_text` = 0/218** |
| §7 YouTube | Partial (timedtext + optional API) |
| §8 Evidence coverage gate | Implemented but **LLM coverage can override computed flags** |
| §9 Re-enrich | Script/SQL exists; products.name still Digistore24 for all 10 |
| §10 ShadowCast import | Companion; out of APF worker scope |

## Quote

> “Symptom today (Digistore): product stored/exported as Digistore24, searches hit marketplace/refund pages, positive_signals become affiliate keyword rules, competitors become Top Digistore24 Marketplace alternative, price becomes EPC copy.”

Live data: name symptom persists on `products.name`; price/competitor symptoms largely fixed; affiliate chrome moved into `review_summary` / `common_complaints`.
