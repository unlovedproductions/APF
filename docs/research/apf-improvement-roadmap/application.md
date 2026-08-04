# Application — Decision walkthrough (Phase 8)

**Investigation:** `apf-improvement-roadmap`  
**Report:** `2026-08-04_decision.md`  
**Status:** awaiting operator decisions (forks deferred)

Research recommends default path: **Fork A=yes, C=yes, D=yes; B=decide on spend**.

| Fork | Prompt | Research default | Your call | Status |
|------|--------|------------------|-----------|--------|
| A | Is APF primarily ShadowCast fuel? | **Yes** — README + workflow [s05] | _pending_ | deferred |
| B | Allow paid Brave API if scrape stays unusable? | Prefer self-host first; paid only if P0.1 blocked >1 week | _pending_ | deferred |
| C | Block auto-export of `complete_degraded`? | **Yes** — quarantine / manual override [s01][s17] | _pending_ | deferred |
| D | Scoring (refunds/EPC) before more discovery UI? | **Yes** [s03][s09] | _pending_ | deferred |

## How to close

Reply with A/B/C/D choices (e.g. `A yes, B no, C yes, D yes`). Agent will update this file to `applied` and optionally open an engineering task list — **implementation is out of scope for this research job**.

## Interim recommendation if you want zero decisions now

Execute **P0.1 (search health) + P0.2 (export gate) + P0.4 (live re-score)** only — lowest regret under all fork outcomes except “APF becomes discovery SaaS” (Fork A=no).
