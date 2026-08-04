# Changelog

All notable changes to APF are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `APF_ALLOW_DEGRADED_EXPORT` opt-in for ShadowCast auto-export of `complete_degraded` briefs (default off)
- Digistore daemon refreshes `products.name` from vendor materials after capture when listing title was weak
- `REVIEW_ENRICHMENT_FULL_PAGE_LIMIT` and `REVIEW_ENRICHMENT_FULL_PAGE_MAX_ATTEMPTS` for full-page fetch success target and attempt budget
- Vendor sales-copy detector (`isVendorSalesCopy`) used when sanitizing narrative fields and video angles
- Page-fetch candidate ranking: tier preference (YouTube → review/scam → video → retailer → vendor), skip permanent fetch errors, retry until rich-page quota or attempt budget exhausted
- Unit coverage for brief finalize scrubbing, page-fetch candidate selection, and vendor-sales detection
- Holistic improvement deep research under `docs/research/apf-improvement-roadmap/`

### Changed

- ShadowCast UI/workflow export requires enrichment `complete` only; `complete_degraded` is quarantined (CLI `--force` / env opt-in still available)
- Default full-page rich success target raised from 4 to 6
- Digistore thin-evidence path prefers an honest limited-independent summary over offer-page sales pitch
- Enrichment worker logs page-fetch success/attempt counts per product

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
