# Capability discovery (Phase 3.5)

**Date:** 2026-08-04  
**Slug:** apf-improvement-roadmap

## Available channels

| Channel | Status | Use |
|---------|--------|-----|
| Repo primary (docs/code) | Available | Architecture, scoring, daemon, enrichment, changelog |
| Prior research folder | Available | `docs/research/apf-enrichment-audit/` (reuse) |
| Web search + fetch | Available | Landscape, scoring science, competitors |
| Context7 | Available if needed | Only for SDK claims; not required for this decision |
| Live MySQL DQS | Available in principle | Skip full re-audit; cite prior SQL sources; optional delta note |
| Paid APIs | Do not introduce | No-paid constraint |

## Subtopic → source map

| Subtopic | Primary | Secondary |
|----------|---------|-----------|
| Enrichment bottleneck (H1) | enrichment-audit report + CHANGELOG delta + enrichment-improvements.md | RAG faithfulness external |
| Scoring calibration (H2) | marketplace-scoring.mjs + README | ClickBank official gravity; industry gravity limits |
| Competitive edge (H3) | APF README/ShadowCast handoff | AffSync, ProfitSpy, AvidAffiliate, marketplace UIs |
| Ops fragility (H4) | digistore24-browser-daemon.mjs + ARCHITECTURE + audit H4 | IMPROVEMENTS.md historical scraping notes |

## Fallbacks

- If Digistore official docs thin → use APF README + daemon code as primary; flag external Digistore claims insufficient
- If competitor marketing copy only → mark as industry/marketing type, require second independent type
