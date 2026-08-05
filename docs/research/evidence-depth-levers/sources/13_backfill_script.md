# Source 13 — backfill-source-content.mjs

- **Type:** primary (code)
- **Credibility:** 5
- **Location:** `scripts/backfill-source-content.mjs`
- **Maps to:** Way 2

## Behavior

- Re-fetches **existing** Digistore thin sources (`forceRefresh: true`)
- Prefers priority tiers: review / scam_advisor / video / retailer
- Does **not** run SERP discovery (avoids diluting rich%)
- npm: `pnpm review:backfill-content`

## Evidence

Ops run 2026-08-05 raised rich from ~20.6% → **41.5%** without adding new SERP rows.

## Notes

Way 2 should prefer this over bulk `review:once`.
