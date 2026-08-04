# Application — Decision walkthrough (Phase 8)

**Investigation:** `apf-improvement-roadmap`  
**Report:** `2026-08-04_decision.md`  
**Status:** rounds 1–2 engineering applied; remaining forks deferred

| Fork | Prompt | Research default | Your call | Status |
|------|--------|------------------|-----------|--------|
| A | Is APF primarily ShadowCast fuel? | **Yes** | _pending_ | deferred |
| B | Allow paid Brave API if scrape stays unusable? | Prefer self-host / fallbacks first | _pending_ | deferred |
| C | Block auto-export of `complete_degraded`? | **Yes** | **yes (code)** | applied |
| D | Scoring (refunds/EPC) before more discovery UI? | **Yes** | **yes (code v2)** | applied |

## Round 1 (2026-08-04)

- **P0.2:** Export requires `complete`; degraded quarantined.
- **P0.3:** Daemon refreshes Digistore names from vendor materials.

## Round 2 (2026-08-04)

- **P0.1:** SearXNG engine fallbacks + HTTP 429/403 handling; optional Firecrawl BYOK; default search delay 8s.
- **P1.1 / P1.2:** `digistore24_native_v2` — refund/cancel rate in quality; enrichment confidence excluded from score.

## Still open

- **P0.4** live DQS / adversarial re-score after Brave is green
- **P1.3** promote→outcome log
- Catalog §9 re-enrich when search stays healthy
