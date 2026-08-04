# Application — Decision walkthrough (Phase 8)

**Investigation:** `apf-improvement-roadmap`  
**Report:** `2026-08-04_decision.md`  
**Status:** round 1 engineering applied; remaining forks deferred

Research recommends default path: **Fork A=yes, C=yes, D=yes; B=decide on spend**.

| Fork | Prompt | Research default | Your call | Status |
|------|--------|------------------|-----------|--------|
| A | Is APF primarily ShadowCast fuel? | **Yes** — README + workflow [s05] | _pending_ | deferred |
| B | Allow paid Brave API if scrape stays unusable? | Prefer self-host first; paid only if P0.1 blocked >1 week | _pending_ | deferred |
| C | Block auto-export of `complete_degraded`? | **Yes** — quarantine / manual override [s01][s17] | **yes (code)** | applied |
| D | Scoring (refunds/EPC) before more discovery UI? | **Yes** [s03][s09] | _pending_ | deferred |

## Round 1 engineering (2026-08-04)

- **P0.2 shipped:** UI + `apfWorkflows` require enrichment `complete`; `APF_ALLOW_DEGRADED_EXPORT` / CLI `--force` opt-in for degraded.
- **P0.3 shipped:** Digistore daemon refreshes `products.name` from vendor materials after capture (worker persist already existed).
- **Still open:** P0.1 search health, P0.4 live DQS / adversarial re-score, then P1 scoring.

## Next

Execute **P0.1 + P0.4** before catalog §9 re-enrich.
