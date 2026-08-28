# Digistore faithfulness audit — 2026-08-28

**N:** 5 Digistore briefs (ids 1–5), post–Wave E  
**Method:** Live MySQL — grounded-signal substring check, entity token presence on review-tier sources, YouTube affiliate heuristics, competitor/price spot-check  
**DQS context:** Hygiene DQS remains high (~97); this audit measures **accuracy**, not DQS.

## Verdict

**Fail faithfulness.** Hygiene gates passed; narrative grounding and entity lock did not.

| id | Product (short) | Signals grounded | Entity mismatch (review-tier) | Price vs cart | Competitors | Pass? |
|----|-----------------|------------------|-------------------------------|---------------|-------------|-------|
| 1 | Joseph’s Well (book) | 0/3 (0%) | 31/61 | $39 vs cart $83.45 | junk: “DIY Water Generator Scam” | **FAIL** |
| 2 | Advanced Amino Formula | 0/1 (0%) | 28/33 | quarantine OK; cart $39.95 unused | empty | **FAIL** |
| 3 | The Genius Wave | 0/0 | 20/25 | **$67 vs cart $49.86** | 1 unpriced | **FAIL** (price + entity) |
| 4 | Medicinal Garden Kit | 1/4 (25%) | 16/23 | quarantine; cart $72.91 | catalog peer only | **FAIL** |
| 5 | Self-Sufficient Backyard | 0/0 | 17/25 | **$67 vs cart $50.99** | junk: “Texas” | **FAIL** |

**Pass rate:** 0/5 (target ≥4/5). Failures drive Tier 1 fixtures.

## Critical findings

1. **Wrong-product contamination (id 1):** Brief treats Joseph’s Well (printed book) as an “atmospheric water generator.” Rival list includes “DIY Water Generator Scam.” Classic soft entity match / SERP namesake failure.
2. **Ungrounded praise/complaints:** When signals exist, almost none fuzzy-match source `content_text`.
3. **Stale `$67` buyer price:** Appears on multiple briefs without matching `cartValue` (Genius Wave, Self-Sufficient Backyard).
4. **Junk competitors:** Single-token / scam-title rivals pass retrieval without enough validation.
5. **YouTube affiliate heuristic:** 0 explicit `#ad`/commission hits in this sample; still ship filter — affiliate promo titles remain a known Digistore risk class.

## Implications for Tier 1

| Gate | Audit evidence |
|------|----------------|
| Quote-ground signals | grounded_pct 0–25% |
| Entity lock on review tiers | high mismatch counts; water-generator summary |
| Buyer-price reconcile vs cart | `$67` vs real cart |
| Affiliate YouTube filter | preventive (sample clean on regex) |
| Thin-evidence conf ≤40 | several empty-signal briefs still conf 45 |

## Next

Ship Tier 1 gates + DQS faithfulness KPIs; re-audit after re-enrich of ids 1–5.
