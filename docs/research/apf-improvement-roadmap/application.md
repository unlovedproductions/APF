# Application — Decision walkthrough (Phase 8)

**Investigation:** `apf-improvement-roadmap`  
**Report:** `2026-08-04_decision.md`  
**Status:** rounds 1–4 engineering applied; §9 catalog re-enrich still ops-gated

| Fork | Prompt | Research default | Your call | Status |
|------|--------|------------------|-----------|--------|
| A | Is APF primarily ShadowCast fuel? | **Yes** | _pending_ | deferred |
| B | Allow paid Brave API if scrape stays unusable? | Prefer self-host / fallbacks first | _pending_ | deferred |
| C | Block auto-export of `complete_degraded`? | **Yes** | **yes (code)** | applied |
| D | Scoring (refunds/EPC) before more discovery UI? | **Yes** | **yes (code v2)** | applied |

## Round 1

- **P0.2:** Export requires `complete`; degraded quarantined.
- **P0.3:** Daemon refreshes Digistore names from vendor materials.

## Round 2

- **P0.1:** SearXNG engine fallbacks + HTTP 429/403; optional Firecrawl; delay 8s.
- **P1.1 / P1.2:** `digistore24_native_v2` — refund/cancel in quality; confidence excluded.

## Round 3

- **P1.3:** `product_promote_outcomes` + `pnpm promote:outcome`; bookmark→`promoting` logs `promote_start`.
- **P0.4:** `pnpm review:dqs [--write]` Digistore enrichment DQS snapshot tooling.

## Round 4

- **P0.1b:** Healthy soft-miss after Brave rate-limit no longer counts as a circuit strike.
- **P0.1c:** Default `SEARXNG_FALLBACK_ENGINES=bing,duckduckgo` (Bing returned hits while Brave was RL).
- **calibrate:** `applyPromoteOutcomeCalibration` gated at ≥3 `promote_result` rows; `pnpm promote:calibrate`.
- **§9 pilot:** product #2 → `complete` (24 sources); product #1 still degraded (pre-fix run). Live DQS **70**, complete **1/10**.

## Still open

- Finish catalog **§9** for products 3–10 (+ requeue #1) one-at-a-time after soft-miss fix
- Accumulate labeled `promote_result` EPC/refund rows so calibration can apply
