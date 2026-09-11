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

## Round 15 (Way 3 Phase B scaffold)

- Shipped `pnpm review:trustpilot` (`scripts/collect-trustpilot-reviews.mjs`): search business units → paginate `all-reviews` → upsert rich sources (`fetch_provider=trustpilot_api`).
- Fails closed without `TRUSTPILOT_API_KEY` (exit 2). Documented in `.env.example`.
- Unit tests for match scoring + review→source mapping.

## Round 16 (calibration integrity)

- Calibration now **excludes** `listing_signal` seeds from `promote_result_n` / ready gate.
- Added `pnpm promote:outcome --import path.csv` (+ template CSV) for real campaign rows.
- Live calibrate: campaign ready_count still **0** (listing seeds alone cannot unlock scoring).

## Round 17 (intel Phase A + campaign skip)

- Sitejabber `trust_boost` demoted to **0** (still review tier; FTC pre-fulfilment context).
- Probe-first page fetch; default probe max **12**; YouTube rich credit requires transcript.
- Competitor buyer prices: `attachCompetitorBuyerPrices` + evidence `price_comparison`.
- Digistore prompt/finalize fixture: commission/EPC stripped from `positive_signals` (unit tests).
- Campaign EPC CSV: **skipped** until real promotions exist — do not invent rows; calibrate stays gated.
- MySQL may be down locally (`ECONNREFUSED :3306`) — unrelated to skip decision.

## Round 18 (Way 1 prune rule coverage)

- Exported `shouldPrune` / `shouldRetain` from `scripts/prune-thin-review-sources.mjs`.
- Unit tests: retain competitors + high-trust retryable; prune aged thin web orphans + permanent 404/410; hold young thin web; never prune rich / already-pruned; permanent errors override high-trust hold.
- Live `pnpm review:prune-thin` dry-run still needs MySQL up (`:3306`).

## Round 19 (ShadowCast form identity mapping)

- Extracted pure `resolveShadowCastFormIdentity` (send-time Digistore name + buyer price; no DB).
- `buildPayload` uses it for `product_name` / `price`.
- Unit coverage: marketplace `Digistore24` + EPC brief → real name + cart `$` (or quarantine when no cart); clean Digistore price pass-through; ClickBank cart fallback.
- Live UI form spot-check still optional ops (unit path is the export source of truth).

## Round 20 (Wave E Digistore re-enrich)

- Started `apf-mysql` Docker; paused review-enrichment daemon for exclusive queue (restarted after).
- Brave SearXNG engine was rate-limited (`too many requests`); ran with `SEARXNG_ENGINES=duckduckgo` + `bing` fallback, `REVIEW_ENRICHMENT_SEARCH_DELAY_MS=10000`.
- Re-enriched Digistore catalog **ids 1–11** one-at-a-time (Playwright often hangs on exit — reap after job terminal).
- Live DQS after Wave E: **97** · `complete` **11/11** · avg confidence **45.5** · synthetic competitors **0** · affiliate chrome **0**.
- Note: several briefs show `price_display=$67` or quarantine — spot-check buyer prices on send; cart refresh may still help.

## Still open

- After real Digistore campaigns: ≥3 weekly `net_epc`/`refund_rate` rows → `--import` → `pnpm promote:calibrate`
  - **2026-08-28:** still gated — 5 `promote_result` rows are all `listing_signal` seeds; `ready_count=0`
- Set `TRUSTPILOT_API_KEY` and run `pnpm review:trustpilot --apply` (optional BYOK)
  - **2026-08-28:** no key in `.env`; collector fails closed (exit 2) as designed
- `pnpm review:prune-thin` dry-run → review sample → `--apply` if candidates look right (MySQL is up)
- Optional: live APF → ShadowCast form spot-check in UI (+ buyer-price sample for `$67` / quarantine rows)
- ~~Manual audit of ~5 Digistore briefs post–Wave E~~ → [`2026-08-28_faithfulness-audit.md`](2026-08-28_faithfulness-audit.md) (**0/5 pass**; drives Tier 1 gates)

## Round 21 (intel accuracy Tier 0–1)

- Faithfulness audit: grounded_signal_rate ~3%, entity_mismatch ~56%, buyer_price_mismatch ~86% (DQS hygiene still ~93)
- DQS report now emits faithfulness KPIs beside hygiene score
- Quote-ground `positive_signals` / `common_complaints`; entity-lock + affiliate YouTube filter; thin-evidence conf ≤40
- `reconcileBuyerPriceWithCart` on finalize + ShadowCast send-time identity
- Unit tests: source-trust / finalize / detail-extractor / shadowcast-direct-lib

## Round 22 (apply gates + name/price/rival hygiene)

- Catalog IDs are now **186–195** (not 1–11). Three commission listing titles rewritten: Amino, CircO2, Mitochondrial.
- Re-enriched all 10 (`SEARXNG_ENGINES=bing`, delay 10s). Jobs must be `queued` (worker now also claims `pending`).
- Live DQS **2026-09-08T05:51Z**: hygiene **95** · complete **10/10** · avg conf **41** · rich 16.2% / HT 23.8% · video-claim gate FAIL
- Faithfulness: buyer-price mismatch **0%** (0/5) · grounded **100% (1/1)** · entity mismatch **61.6% (217/352)** · competitor empty **50%** · rival prices n/a (name-only)
- Residual: all `products.category` still `Digistore24 Marketplace` (catalog rivals leak until category is real); 5/10 prices quarantined to offer page; stored SERP junk still inflates entity mismatch
- Snapshot: [`2026-09-08_dqs-snapshot.md`](2026-09-08_dqs-snapshot.md) · notes: [`2026-09-08_round22.md`](2026-09-08_round22.md)
