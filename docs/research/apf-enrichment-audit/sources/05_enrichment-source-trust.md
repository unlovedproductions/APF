# Source 05 — scripts/enrichment-source-trust.mjs

- **Type:** primary (code)
- **Credibility:** 5

## Capabilities

- Host tiers: retailer / review / scam_advisor / video / affiliate_noise
- `evidenceCoverageFromSources` flags: `has_independent_review`, `has_vendor_material`, by_type/by_tier
- Digistore evidence/vendor/competitor query builders
- `normalizeSuggestedCompetitors` rejects marketplace/synthetic names
- `splitClaimAndReviewSources` separates vendor vs independent
- `stripAffiliateMetaLines` / `isAffiliateMetaSignal`

## Live gap

Split + strip exist, but Digistore briefs still put compliance/nav/commission text into `review_summary` and `common_complaints`. Strip does not cover narrative fields; LLM prompt compliance is not server-enforced for those fields.
