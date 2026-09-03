# Changelog

All notable changes to APF are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Digistore faithfulness audit + DQS faithfulness KPIs (`grounded_signal_rate`, `entity_mismatch_rate`, `competitor_empty_rate`, `competitor_price_fill_rate`, `substantive_independent_rate`, `buyer_price_mismatch_rate`)
- Quote-grounding for `positive_signals` / `common_complaints`; entity-lock + affiliate YouTube filter on review sources
- `reconcileBuyerPriceWithCart` — rewrite stale brief `$` prices that disagree with `cartValue`/vendor pricing
- Sentry observability: Express errors/traces/profiling (`SENTRY_DSN`), structured logs with PII stripping, React client errors + browser tracing (`VITE_SENTRY_DSN`)
- Oxylabs SERP as last search fallback after Firecrawl (`OXYLABS_USERNAME` / `OXYLABS_PASSWORD`)
- Playwright stealth full-page fetch escalate path (`REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH`); prefer self-hosted Firecrawl (`FIRECRAWL_BASE_URL`) over cloud BYOK
- Review-brief `claim_ledger` persistence + Digistore vendor-material extraction hardened against affiliate meta chrome
- Competitor buyer-price attachment on suggested competitors; deeper Phase A probe corpus (Sitejabber demotion covered in tests)
- `pnpm promote:outcome --import path.csv` — bulk campaign promote_result import (rejects `listing_signal` notes); template at `docs/research/apf-improvement-roadmap/promote-result.template.csv`
- `pnpm review:trustpilot` — Way 3 Phase B Trustpilot Business Units API collector (`TRUSTPILOT_API_KEY`, dry-run default, cursor file under `.data/`)
- Way 3 Phase A: Digistore direct review probes `max: 12`; Reddit public `.json` body fetch (`redditJsonUrl` / `reddit_json` provider)
- `pnpm review:prune-thin --days 0` — disable age gate for soft-pruning fresh thin web orphans
- `pnpm digistore:refresh-names` — refresh Digistore placeholder names from vendor materials (`--dry-run` / `--product-id`)
- `applyPromoteOutcomeCalibration` + `pnpm promote:calibrate` (gated until ≥3 `promote_result` rows)
- `shouldCountSearchRateLimitStrike` — healthy soft-miss after primary rate-limit does not open circuit
- `product_promote_outcomes` table + `pnpm promote:outcome` CLI for Hidden Gem calibration (bookmark `promoting` logs `promote_start`)
- `pnpm review:dqs` Digistore enrichment DQS snapshot (`--write` saves under research folder)
- `APF_ALLOW_DEGRADED_EXPORT` opt-in for ShadowCast auto-export of `complete_degraded` briefs (default off)
- Digistore daemon refreshes `products.name` from vendor materials after capture when listing title was weak
- SearXNG engine fallbacks (`SEARXNG_FALLBACK_ENGINES`) + HTTP 429/403 rate-limit handling
- Optional Firecrawl BYOK search/scrape fallback when SearXNG is rate-limited
- Digistore listing refund/cancellation rate parsing into `detected_refund_rate`
- `REVIEW_ENRICHMENT_FULL_PAGE_LIMIT` and `REVIEW_ENRICHMENT_FULL_PAGE_MAX_ATTEMPTS` for full-page fetch success target and attempt budget
- Vendor sales-copy detector (`isVendorSalesCopy`) used when sanitizing narrative fields and video angles
- Page-fetch candidate ranking: tier preference (YouTube → review/scam → video → retailer → vendor), skip permanent fetch errors, retry until rich-page quota or attempt budget exhausted
- Unit coverage for brief finalize scrubbing, page-fetch candidate selection, vendor-sales detection, ShadowCast Digistore name/price send-time locks, and thin-source prune rules
- Holistic improvement deep research under `docs/research/apf-improvement-roadmap/`
- Product-vendor-intel deep research under `docs/research/` (scrape, reviews, pricing)

### Fixed

- Local APF shutdown treats SIGTERM as a clean exit (`bba381f`)
- Pin yanked `esbuild@0.24.3` so `pnpm install` restores `tsx` (`b2ca10c`)
- Promote calibration ignores `listing_signal` marketplace EPC seeds — only real campaign `promote_result` rows count toward the ≥3 gate
- Digistore daemon `--promote` recovery: reopen known `/detail/{id}` URLs when generated links are not on the current marketplace listing
- Digistore daemon client: long `/collect` no longer dies at ~300s (undici/fetch headers timeout). Uses `node:http` with overall deadline = login wait + ~90s/product.
- Digistore daemon `/health` no longer calls `ensureBrowser()` (was racing the shared page during collect and spamming logs). Collect is single-flight (`collectBusy` → 409).
- Digistore daemon `ensureBrowser`: real liveness ping (`browser.isConnected` + `page.evaluate`) so dead Firefox contexts are relaunched instead of failing on `newPage`.
- Sentry Node preload so Express instrumentation starts correctly

### Changed

- Soft-prune pass: all-rich **80.7%**, deep **67.7%**, high-trust **96.7%** (pruned 367); ≥60% all-rich target cleared
- Way 2 depth-backfill pass: all-rich **48.9%**, high-trust rich **96.7%**, deep **32.4%** (was ~42% / ~79% / ~24%); +28 newly rich sources
- Digistore catalog Wave E re-enrich: **11/11** briefs `complete`, live DQS **97**, rich-source rate **9.3%** (was 10/10 / ~8%)
- Vendor title junk filter skips page-not-found / Coda 404 titles during name resolution
- Digistore catalog §9 re-enrich: **10/10** briefs `complete`, live DQS **97** (was 70 / 1/10 complete)
- Default `SEARXNG_FALLBACK_ENGINES` is now `bing,duckduckgo` (Bing returned hits while Brave was rate-limited)
- ShadowCast UI/workflow export requires enrichment `complete` only; `complete_degraded` is quarantined (CLI `--force` / env opt-in still available)
- Default enrichment search delay raised from 5s to 8s
- Digistore scorer `digistore24_native_v2`: refund/cancel rate in quality; enrichment confidence excluded from score
- Default full-page rich success target raised from 4 to 6
- Digistore thin-evidence path prefers an honest limited-independent summary over offer-page sales pitch
- Enrichment worker logs page-fetch success/attempt counts per product
- Enrichment rescore + score backfill feed `promote_result` rows into gated calibration
- Thin/blocked page escalate order: Playwright stealth → Jina → Firecrawl

## [2026-08-02]

### Added

- Search circuit-breaker and SERP-less review probes (`365ca2c`)
- Enrichment multi-skill audit research under `docs/research/apf-enrichment-audit/` (`54b57cc`)

### Changed

- Enrichment degrade gates, page-cache TTL, and affiliate noise filters tightened (`ca5702f`)
- Enrichment gates hardened against LLM override and affiliate chrome (`5d490af`)
- WarriorPlus V2 vendor-only import clarified; API auth hardened (`2c004b9`)

## [2026-07]

### Added

- Digistore product-name resolution and buyer-price sanitization before ShadowCast send
- Review enrichment grounding in resolved product identity and real evidence
- Page-fetch SSRF controls and enrichment queue scoping

### Fixed

- Digistore session false positives on `auth_testpay` URLs
- Digistore24 refresh failures from schema drift and Firefox daemon startup
- Remaining audit Medium/Low correctness findings
