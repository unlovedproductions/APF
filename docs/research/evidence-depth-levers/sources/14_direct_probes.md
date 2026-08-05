# Source 14 — directReviewSiteCandidates

- **Type:** primary (code)
- **Credibility:** 5
- **Location:** `scripts/enrichment-source-trust.mjs` → `directReviewSiteCandidates`
- **Maps to:** Way 3

## Behavior (verbatim structure)

For product/vendor slug, pushes up to `max` (default 8):

- `trustpilot.com/review/{slug}`
- `sitejabber.com/reviews/{slug}`
- `scamadvisor.com/check-website/{slug}`
- `scam-detector.com/scanner/{slug}`
- BBB search
- `old.reddit.com/search?q=…`
- Trustpilot search

Marked `raw_json.direct_probe: true`. Worker leads Digistore jobs with these probes so SERP suspension cannot hollow the job.

## Gap

Probes often remain thin if page-fetch fails (SPA/WAF). Way 3 = make these rows **rich by design** (API review text / transcripts), not title-only probes.
