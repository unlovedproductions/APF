# Evidence Depth Levers — Plan

**Slug:** `evidence-depth-levers`  
**Date:** 2026-08-05  
**Genre:** decision  
**Depth:** deep  
**Constraint:** Research artifact only — no production code in this pass.

## Decision

How should APF raise *usable* Digistore ShadowCast evidence depth past the cleared ≥40% rich / ≥60 avg-conf floor toward **video-claim grade** (≥60% catalog rich **or** ≥70% rich among high-trust tiers), without inventing narrative from titles or vendor sales copy?

## Reframed question

Which of three levers — **denominator surgery**, **numerator fetch budget**, or **source-class expansion** — should ship first, and how do they compose?

## Falsifiable hypotheses

| ID | Claim |
|----|--------|
| H1 | Rich% is capped mainly by accumulation of thin SERP rows (no prune; ~82 sources/SKU; ≤10 rich fills/job). |
| H2 | Local Cheerio fetch fails on JS/WAF review hosts; Firecrawl/backfill without new SERP moves rich% without inventing claims. |
| H3 | SERP-first discovery stays thin-heavy; Trustpilot/Reddit/YT transcripts produce longer `content_text` and better brief substance than raw catalog rich%. |

## Prior work (reuse)

- `docs/research/apf-enrichment-audit/` — F3 zero content_text
- `docs/research/apf-improvement-roadmap/` — F1 enrichment bottleneck; live DQS 2026-08-05
- Pipeline: `scripts/enrichment-page-fetch.mjs`, `scripts/review-enrichment-worker.mjs`, `scripts/backfill-source-content.mjs`

## Sourcing strategy

1. Primary internal: worker limits, page-fetch tiers, DQS snapshot, backfill script
2. External: Firecrawl, Jina, Browserless, Trafilatura, Cohere rerank, Trustpilot API, youtube-transcript-api, Anthropic Contextual Retrieval
3. Academic: arXiv Less-is-More RAG; multi-document RAG degradation
4. Triangulation: ≥3 differently-typed sources per Way thesis

## Opposition queries

- Is rich% the wrong KPI?
- Does Way 2 alone clear ≥60% without prune?
- Does raising confidence floors fake depth?
- Does creative cadence beat enrichment for affiliates?

## Risk register

| Risk | Mitigation |
|------|------------|
| Gaming rich% via snippet_fallback | Exclude from “deep” DQS metric |
| Over-prune vs-battle context | Retain competitor URLs; age+thin gate only |
| Paid SaaS creep | Free ladder first (local → Jina → Firecrawl); no Apify without spend approval |
| Confidence theater | Conf follows substantive independent text only |

## Stop criteria

- Research folder complete with sources, findings (incl. Way 1–3 implementable specs), decision report, refresh_targets
- Each Way triangulated ≥3 source types
- Adversarial pass recorded
- No production code changed

## Changelog

- 2026-08-05: Investigation opened and completed in one pass (plan approval).
