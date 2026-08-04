# APF Holistic Improvement Roadmap — Plan

**Slug:** `apf-improvement-roadmap`  
**Date:** 2026-08-04  
**Genre:** decision (+ landscape)  
**Depth:** deep

## Decision

Given APF’s current state (multi-marketplace discovery → Hidden Gem scoring → enrichment → ShadowCast handoff), **which improvements deliver the most leverage in the next 30–90 days**, ranked by impact vs cost, with disconfirming evidence and explicit “do not build” items?

## Reframed question

Where should Unloved spend the next engineering/ops cycles on APF to raise *usable affiliate discovery → promoteable creative* throughput, under a no-paid-SaaS / one-developer constraint?

## Falsifiable hypotheses

| ID | Claim |
|----|--------|
| H1 | Enrichment quality remains the bottleneck for ShadowCast value — further product features without closing enrichment/gate debt underperform. |
| H2 | Scoring/discovery (Hidden Gem, Digistore heuristics, cross-marketplace signal) is under-calibrated vs real promote/refund outcomes; better signals beat more UI. |
| H3 | Competitive tools already cover discovery UX; APF’s edge is the local enrichment → ShadowCast loop, not marketplace browsing. |
| H4 | Collector/ops fragility (Digistore Firefox daemon, session, queue silent-degrade) destroys more value than missing features. |

## Prior work (reuse, do not re-litigate)

- `docs/research/apf-enrichment-audit/` — Enrichment System Score 56/100, adversarial BLOCK (2026-07-28)
- `docs/enrichment-improvements.md` + CHANGELOG delta since audit (page-fetch quotas, vendor-sales scrubbing, circuit-breaker, gate hardening)

## Sourcing strategy

1. Primary internal: architecture, scoring modules, Digistore daemon, ShadowCast handoff, prior audit, IMPROVEMENTS.md
2. External landscape: affiliate discovery practice; Gravity/EPC/refund signal limits; competing tools
3. Opposition: UI-first, scoring-is-fine, more-marketplaces, enrichment-fixed-post-changelog
4. Triangulation: ≥3 independent differently-typed sources per thesis

## Opposition queries

- Is discovery UI / more marketplaces the real bottleneck?
- Did post-audit enrichment changes already close H1?
- Are Digistore native heuristics “good enough” for ranking?
- Does ops fragility matter if enrichment is the gate?

## Risk register

| Risk | Mitigation |
|------|------------|
| Re-researching enrichment audit | Cite as primary; only verify changelog delta |
| Affiliate blog spam | Prefer primary docs/code + reputable industry sources; flag thin claims |
| Over-claiming scoring science | Mark under-determined without outcome-labeled data |
| Credit burn | Cheap models for sweeps; strong only for synthesis/adversarial |

## Stop criteria

- ≥12 saved sources; H1–H4 verdicted with triangulation
- Every P0 roadmap claim triangulated
- Adversarial pass complete
- `refresh_targets.md` + `application.md` written
- Final report: `2026-08-04_decision.md`

## Changelog

- 2026-08-04: Investigation opened; hypotheses locked.
- 2026-08-04: Deep run complete — 21 sources, claims ledger, decision report, refresh_targets, application.md (forks deferred).
