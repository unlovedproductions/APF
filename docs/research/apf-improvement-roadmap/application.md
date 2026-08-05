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

## Round 9

- Daemon client long `/collect` timeout fix (shipped).
- **Promote recovery:** `--promote` reopens known `/detail/{id}` URLs when SKUs are not on the current listing.

## Round 10

- `ensureBrowser` liveness: `browser.isConnected` + `page.evaluate` (dead contexts relaunch).
- `/health` reports real `browserReady` (no stale marketplace URL from a dead page).
- Promote completed: **11/11** affiliate links `approved`.

## Round 11 (Way 2)

- `pnpm review:depth-backfill --limit 15`: 39 attempted, **+28 newly_rich**, 0 errors.
- Live DQS @14:57Z: all-rich **48.9%** (434/888), high-trust **96.7%** (323/334), deep **32.4%** (218/672), gate PASS, DQS **97**.
- High-trust saturated — stop HT Firecrawl retries.

## Round 12 (Way 3A + prune)

- Soft-prune `--days 0 --apply`: **350** thin web orphans → all-rich **80.7%** (434/538), deep **67.7%**, pruned total **367**.
- Digistore probe max **8→12**; Reddit public `.json` fetch (`fetch_provider=reddit_json`).
- ≥60% all-source rich **CLEAR**. Unit tests for page-fetch + source-trust pass.

## Round 13 (Way 3A finish)

- Digistore generic web SERP upserts capped at **5** (`REVIEW_ENRICHMENT_MAX_WEB_SOURCES`).
- YouTube transcript harden: watch-page `captionTracks` fallback when timedtext list empty (no paid key).
- Live DQS @17:10Z: all-rich **80.7%**, high-trust **96.7%**, deep **67.7%**, gate PASS, DQS **97**.

## Round 14 (export smoke)

- `pnpm export:shadowcast` for products **1–11**: all wrote enriched JSON; enrichment `complete`; affiliate host `checkout-ds24.com`.
- `pnpm promote:calibrate`: still gated — **5** listing_signal rows, **0** products with ≥3 `promote_result`.
- Evidence metrics unchanged @17:15Z (all **80.7%** / HT **96.7%** / deep **67.7%**).

## Still open

- Accumulate **real campaign** `promote_result` rows (≥3/product) for calibration
- **Way 3 Phase B** Trustpilot API (optional; needs key) — evidence ≥60% already cleared
