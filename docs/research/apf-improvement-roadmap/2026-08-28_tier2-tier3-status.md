# Tier 2 / Tier 3 status — 2026-08-28

## Tier 2 — Trustpilot (`tier2-trustpilot`)

**Status:** blocked on BYOK — no `TRUSTPILOT_API_KEY` in `.env`.

Verified fail-closed:

```text
pnpm review:trustpilot → exit 2 Missing TRUSTPILOT_API_KEY
```

**You do next:** add key → `pnpm review:trustpilot --dry-run` → `--apply` for Digistore products.

## Tier 3 — Promote calibrate (`tier3-promote-calibrate`)

**Status:** gated — no real campaign outcomes.

| Fact | Value |
|------|-------|
| `promote_result` rows | 5 |
| `listing_signal` seeds | 5 |
| Real campaign rows | 0 |
| Products with `ready=true` (≥3 real results) | 0 |

`pnpm promote:calibrate` correctly refuses to unlock scoring.

**You do next:** after real Digistore campaigns, import via:

```text
pnpm promote:outcome --import docs/research/apf-improvement-roadmap/promote-result.template.csv
pnpm promote:calibrate
```

Do **not** invent campaign rows.
