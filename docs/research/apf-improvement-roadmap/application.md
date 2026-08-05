# Application — Decision walkthrough (Phase 8)

**Investigation:** `apf-improvement-roadmap`  
**Report:** `2026-08-04_decision.md`  
**Status:** rounds 1–7 applied; Digistore catalog **11/11 complete**, DQS **97**

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
- **P0.1c:** Default `SEARXNG_FALLBACK_ENGINES=bing,duckduckgo`.
- **calibrate:** `applyPromoteOutcomeCalibration` gated at ≥3 `promote_result` rows.

## Round 5

- **§9:** Digistore products 1–10 → **10/10 `complete`**, live DQS **97**.
- **P1.3b:** Enrichment rescore + score backfill load `promote_result` rows (gated).

## Round 6

- Page-fetch harden, Digistore name-clobber guard, CLI export gate, promolink coverage.

## Round 7

- **`pnpm digistore:refresh-names`:** #11 `Digistore24 Product 51603` → `Advanced Memory Formula Supplements`.
- Junk vendor titles: skip page-not-found / Coda 404 titles in name resolution.
- Enriched #11 → `complete`, conf **50**, page-fetch **10/10** rich. Catalog **11/11 complete**, rich-source **9.3%**.

## Still open

- Raise rich `content_text` rate (evidence depth for ShadowCast video quality)
- Approve more Digistore promolinks (ops)
- Accumulate labeled `promote_result` EPC/refund rows so calibration can apply
