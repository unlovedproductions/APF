# F3 — Source-class expansion (H3 under-determined but high leverage)

**Thesis:** Specialized review corpora (Trustpilot review text, Reddit threads, YouTube transcripts) produce longer `content_text` and better ShadowCast substance than SERP web hits — even when catalog rich% is middling.

**Evidence:** sources 08, 09, 14 + industry pattern; internal probes exist but often stay thin  
**Verdict:** **Plausible / high leverage**; not yet A/B proven on Digistore n=11 post-41.5%. Ship after Way 1+2 if briefs still feel claim-thin.

## Mechanism

- `directReviewSiteCandidates` already builds Trustpilot/Sitejabber/Reddit/BBB URLs
- Probe pages are SPA-heavy → local fetch thin; titles blocked from inventing praises (`substantiveReviewSources`)
- Official Trustpilot review `text` + YT captions are body-dense by design

## Way 3 implementable spec — probe / corpus expansion

### Phase A — free, no new SaaS (do first)

1. **Raise probe max** for Digistore: `directReviewSiteCandidates(..., { max: 12 })` (today 8).
2. **Force page-fetch** all `direct_probe` URLs before SERP fillers (already first in worker — keep).
3. **YouTube:** ensure every video-tier URL runs transcript path; if `TRANSCRIPT_API_KEY` missing, add Node-side timedtext / caption fetch equivalent to youtube-transcript-api (no browser). Store full transcript in `raw_json.content_text`.
4. **Reddit:** prefer `old.reddit.com/.../.json` where available for post+comments text (ToS-aware, public JSON); skip Pushshift.
5. Cap generic `web` SERP to ≤5 of `MAX_SOURCES`; reserve slots for review/video/scam.

### Phase B — Trustpilot API (key required)

1. Resolve business unit: search by product/vendor name → `businessUnitId`.
2. Paginate `.../business-units/{id}/all-reviews` with `pageToken`.
3. Upsert one `product_review_sources` row per review (or batched page) with:
   - `url`: canonical Trustpilot review URL
   - `content_text`: review `text` (+ title)
   - `raw_json.fetch_provider`: `trustpilot_api`
   - `source_type` / host tier: review
4. Respect rate limits; store pagination cursor in `.data/trustpilot-cursors.json`.

### Phase C — explicitly deferred

| Item | Why deferred |
|------|----------------|
| Apify Trustpilot/YouTube actors | Paid; need spend approval |
| Pushshift / RedditData dumps | Restricted/unreliable |
| TikTok/Instagram scrapers | High ToS/legal risk; low ROI for Digistore info products |

### Probe URL matrix (extend)

| Host | Current | Expansion |
|------|---------|-----------|
| Trustpilot review/{slug} | yes | + API reviews when key exists |
| Trustpilot search | yes | keep |
| Sitejabber | yes | keep + fetch body |
| ScamAdviser / Scam Detector | yes | keep |
| BBB search | yes | keep |
| Reddit search | yes | + `.json` thread bodies for top hits |
| YouTube (from SERP) | via fetch | transcript mandatory for rich credit |

### Quality gates (non-negotiable)

- Keep `sourceHasUsableReviewText` / chrome filters — no praises from titles.
- Affiliate chrome scrubbing stays on.
- Do not invent competitors.

### Effort / risks

- Effort: medium–large (collectors + tests)
- Risk: affiliate-tainted “reviews”; API access friction
- Cost: $0 for Phase A; Trustpilot key for Phase B

### Hypothesis status

**H3 under-determined** quantitatively; **recommended third** after Way 1+2 for qualitative ShadowCast fuel.
