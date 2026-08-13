# F2 — Customer review collection methods

**Thesis (H1):** Specialized review corpora (Trustpilot API text, Reddit `.json`, YouTube transcripts) beat generic SERP scrape volume for usable review substance on Digistore/ClickBank info products.

**Evidence:** [05](../sources/05_trustpilot_api.md), [06](../sources/06_youtube_transcript_prior.md), [07](../sources/07_direct_probes_prior.md), [10](../sources/10_ftc_sitejabber.md), [16](../sources/16_scamadviser_api.md), [18](../sources/18_f3_source_class_prior.md), [19](../sources/19_reddit_json_pattern.md), [22](../sources/22_opposition_creative_vs_enrichment.md)

**Types:** primary API + oss + regulator + prior finding + discussion — triangulation OK.

## Verdict

**Confirm H1** (qualitative / mechanism; quantitative A/B still under-determined, same as prior F3).

## Better methods (ranked)

### Phase A — free / already partially wired (ship next)

1. Force body fetch on all `direct_probe` URLs before SERP fillers ([07](../sources/07_direct_probes_prior.md), [18](../sources/18_f3_source_class_prior.md)).
2. Reddit: prefer `old.reddit.com/.../.json` for post+comments ([19](../sources/19_reddit_json_pattern.md)).
3. YouTube: mandate transcript/timedtext for video-tier rich credit ([06](../sources/06_youtube_transcript_prior.md)).
4. Cap generic web SERP slots; reserve review/scam/video ([18](../sources/18_f3_source_class_prior.md)).
5. Raise Digistore probe max (8→12) if host diversity low ([18](../sources/18_f3_source_class_prior.md)).

### Phase B — BYOK

1. Trustpilot: `/business-units/find` → `/all-reviews` pageToken pagination; upsert review `text` as rich rows ([05](../sources/05_trustpilot_api.md)).
2. Optional Scamadviser Trust Score for *vendor domain* risk — not product reviews ([16](../sources/16_scamadviser_api.md)).

### Quality gates

- Sitejabber: keep probe, **downgrade trust** after FTC pre-fulfilment rating order ([10](../sources/10_ftc_sitejabber.md)). Never treat star averages as experience-proof.
- No praises from titles alone; claim/review split stays ([00](../sources/00_capability_discovery.md)).
- Do not scrape Sitejabber via Cloudflare tutorials as “official API.”

### Deferred

Apify review actors, Pushshift, TikTok/IG scrapers ([18](../sources/18_f3_source_class_prior.md)).

## Opposition answer

Creative cadence can beat enrichment for paid-media affiliates ([22](../sources/22_opposition_creative_vs_enrichment.md)), but APF→ShadowCast briefs require independent text or they become confidence theater.
