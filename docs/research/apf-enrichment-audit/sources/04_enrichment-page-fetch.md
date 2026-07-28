# Source 04 — scripts/enrichment-page-fetch.mjs

- **Type:** primary (code)
- **Credibility:** 5

## Controls present

- `assertSafeFetchUrl`: http(s) only, no credentials, blocked hostnames, DNS private-IP reject
- Manual redirect loop with re-validation per hop
- Size/timeout caps; cheerio main-text extraction
- High-trust tier gate + vendor domain allow

## Gaps (adversarial)

- DNS lookup then separate `fetch()` → rebinding TOCTOU
- Azure IMDS `168.63.129.16` not blocked
- Vendor domains always fetch-eligible
- Cache early-return on any cached `content_text` (stale forever)

## Live contradiction

Module exists and is called from worker `saveSources` → `enrichHighTrustSources`, yet live DB shows **0/218** sources with `content_text`. Either fetch never succeeds, never persists into `raw_json`, or sample jobs predate persistence path.
