# Enrichment Improvements

Action plan for better review briefs and competitor data flowing from APF → ShadowCast.

**Primary code**

| Area | File |
|------|------|
| Enrichment worker | [`scripts/review-enrichment-worker.mjs`](../scripts/review-enrichment-worker.mjs) |
| Brief finalize / scrubbing | [`scripts/enrichment-brief-finalize.mjs`](../scripts/enrichment-brief-finalize.mjs) |
| Full-page fetch | [`scripts/enrichment-page-fetch.mjs`](../scripts/enrichment-page-fetch.mjs) |
| Query + trust helpers | [`scripts/enrichment-source-trust.mjs`](../scripts/enrichment-source-trust.mjs) |
| Digistore name/price helpers | [`scripts/digistore24-detail-extractor.mjs`](../scripts/digistore24-detail-extractor.mjs) |
| ShadowCast export | [`scripts/shadowcast-direct-lib.mjs`](../scripts/shadowcast-direct-lib.mjs) |
| Digistore prompt | [`docs/prompts/enrichment-digistore24.txt`](prompts/enrichment-digistore24.txt) |
| Generic prompt | [`docs/prompts/enrichment-generic.txt`](prompts/enrichment-generic.txt) |
| ShadowCast import | `shadowcast-/backend/apf_import.py` |

**Symptom today (Digistore):** product stored/exported as `Digistore24`, searches hit marketplace/refund pages, `positive_signals` become affiliate keyword rules, competitors become `"Top Digistore24 Marketplace alternative"`, price becomes EPC copy.

---

## Priority order

Do these in sequence. Later items assume earlier ones exist.

1. Resolve product identity before enrich
2. Sanitize price / discount on write
3. Kill synthetic competitor fallback; add competitor retrieval
4. Harden source trust + Digistore host filters
5. Split claims vs independent reviews
6. Fetch full pages for high-trust hosts
7. Re-enqueue Digistore enrichment jobs

---

## 1. Resolve product identity before enrich

### Problem

`digistoreEvidenceQueries(product)` quotes `product.name`. When name is `Digistore24`, every query searches Digistore the platform, not the offer. Real titles already exist in `vendor_materials[].title`.

### How

1. Reuse (or share) helpers from `digistore24-detail-extractor.mjs`:
   - `isMarketplaceBrandName`
   - `resolveExportProductName(product, vendorMaterials)`
   - `sanitizeExportProductName`
2. In `processJob` (`review-enrichment-worker.mjs`), after `loadVendorMaterials`:
   ```js
   const resolvedName = isDigistore
     ? resolveExportProductName(product, vendorMaterials)
     : product.name;
   const enrichProduct = { ...product, name: resolvedName };
   ```
3. Pass `enrichProduct` into:
   - `queriesFor` / `digistoreEvidenceQueries`
   - `scoreSource`
   - `summarizeWithOllama` / `consumerProductContext`
   - `saveBrief` product context (and optionally `UPDATE products SET name=?` when marketplace brand — separate backfill job if preferred)
4. Prefer vendor-material title order: `offer_page` → `order_page` → others.
5. From titles like `Earn 60% Commission Promoting CircO2 … - health`, capture the product segment via the existing commission-promoting regex.
6. Reject junk titles: `Compliance Guidelines`, `Banners`, marketplace brand alone.
7. Fallback: `Digistore24 Product {platformProductId}` — never leave bare `Digistore24`.

### Verify

- Log resolved name per job: `[54669] Digistore24 → Joseph's Well`.
- Spot-check: queries contain `"Joseph's Well" review`, not `"Digistore24" review`.
- Unit tests already sketched in `server/digistore24-detail-extractor.test.ts` for `resolveExportProductName`.

---

## 2. Sanitize price and discount on write

### Problem

`finalizeBrief` clamps `price_display` to 200 chars but does not reject affiliate marketing. Digistore export previously copied that string into `discount_info`.

### How

1. Add / reuse `sanitizeBuyerPrice(value, cartValue)` from `digistore24-detail-extractor.mjs`.
2. In `finalizeBrief`:
   ```js
   price_display: sanitizeBuyerPrice(
     brief.price_display || derivePriceDisplay(product),
     product.cartValue
   ),
   ```
3. Accept only short buyer prices: `$67`, `$67.00`, `Free`, `Varies`, `See official offer page`, simple ranges.
4. Reject strings containing: `epc`, `commission`, `conversion rate`, `affiliates are seeing`, `/sale`, multi-sentence marketing.
5. Fall back: numeric `cartValue` → `$N.NN` → `See official offer page` (Digistore) or `Varies` (generic).
6. In `shadowcast-direct-lib.mjs`, Digistore `discount_info` must only include real coupon/discount text — never copy `price_display`.
7. Mirror the same price sanitize in ShadowCast `apf_import.py` as defense in depth.

### Verify

- Fixture: EPC headline → `See official offer page`.
- Fixture: `$47.00` → unchanged.
- Export `shadowcast_import.discount_info` empty when only EPC text existed.

---

## 3. Better competitors (retrieval + validate)

### Status (shipped 2026-08-14)

Retrieval + validation is live: `competitorEvidenceQueries`, extract from hits/vendor copy/catalog, LLM constrained to candidates, no synthetic `Top/Popular/Budget …` placeholders, `<2` competitors demotes `vs_battle`/`elimination`.

**Residual (this round):** attach competitor `price_display` from evidence hits and prefer evidence-built `price_comparison` over LLM filler. Do not reopen synthetic names.

### Problem (historical)

Competitors were LLM-only. `normalizeSuggestedCompetitors` fell back to synthetic names:

```js
`Top ${category} alternative`
`Popular ${category} competitor`
`Budget ${category} option`
```

Those poisoned ShadowCast `vs_battle` / `elimination` scripts.

### How (landed)

#### 3a. Remove synthetic fallback

In `normalizeSuggestedCompetitors`:

- If cleaned list length `< 2`, return the cleaned list (possibly empty) — **do not** invent placeholders.
- If length `< 2` after finalize, force `recommended_content_style` away from `vs_battle` / `elimination` unless user overrides later in ShadowCast (prefer `honest_review` or `worth_it_or_waste`).

#### 3b. Dedicated competitor search pass

After name resolution, run queries (`competitorEvidenceQueries(product)`):

```text
"{name}" vs
"{name}" alternative
best alternative to "{name}"
"{name}" or
"{category}" alternatives   # only if category is not "Digistore24 Marketplace"
```

Save hits with `source_type: "competitor_search"` (or tag in `raw_json`).

#### 3c. Extract candidate names

From titles/snippets:

- Patterns: `X vs Y`, `X or Y`, `alternatives to X: A, B`, `best X alternatives`.
- Strip the subject product name; keep other proper-noun product phrases (2–6 words).
- Dedupe case-insensitively; drop vendor name and marketplace brand.

#### 3d. Validate before keep

Keep a competitor only if **at least one** of:

- Appears in ≥1 search title/snippet, or
- Matches another row in `products` (same platform or overlapping category), or
- Appears in vendor sales copy “compare / vs” section with a clear product name

Cap at 2–4. Optional richer shape:

```json
{ "name": "CircO2", "why": "same nitric-oxide niche", "source_url": "…", "price_display": "$49.95" }
```

ShadowCast keeps consuming string arrays; map `.name` on export until the UI is updated.

#### 3e. Prompt change

In `enrichment-digistore24.txt` / `enrichment-generic.txt`:

- Pass `{{COMPETITOR_CANDIDATES_JSON}}` (retrieved list).
- Rule: `suggested_competitors` must be chosen from candidates only; empty array if none are real.
- Never invent brand names.

#### 3f. Competitor buyer prices (shipped this round)

- `attachCompetitorBuyerPrices` scans competitor/search hit text for short `$` prices via `extractShortBuyerPrice` (rejects EPC windows).
- `finalizeBrief` prefers `evidencePriceComparison` when rivals have `price_display`; otherwise keeps sanitized LLM/generic fallback.
- Do **not** use Keepa/Rainforest for Digistore info products.

### Verify

- No brief contains `Top .* alternative` / `Popular .* competitor`.
- When vs-style is chosen, competitors are real product names.
- Unit test: `normalizeSuggestedCompetitors` with empty LLM output → `[]`, not placeholders.
- When hit text has `$59` near a rival name, `price_comparison` cites that figure.

---

## 4. Harden source trust and Digistore filters

### Problem

Digistore scoring boosts vendor domains heavily. Affiliate dashboards and Digistore app pages still enter `review_sources`. Amazon/Walmart site-queries are weak for digital info products.

### How

#### 4a. `classifySourceHost` (`enrichment-source-trust.mjs`)

Add / strengthen tiers:

| Host pattern | Tier | Trust |
|--------------|------|-------|
| `digistore24-app.com`, `digistore24.com` app/marketplace paths | `affiliate_noise` | ≤ −30 |
| hop / promolink / jvzoo / warriorplus / clickbank | `affiliate_noise` | ≤ −25 |
| trustpilot, reddit | review | +20 |
| sitejabber | review | **0** (FTC pre-fulfilment ratings; keep probe, demote trust) |
| bbb, scamadvisor | scam_advisor | keep |
| youtube.com | video | keep / slight boost for “review” titles |

#### 4b. `scoreSource` (`review-enrichment-worker.mjs`)

- Require resolved product name match (or strong vendor-domain + product token) for Digistore relevance ≥ threshold; drop or heavily downrank Digistore-only pages.
- Penalize titles/snippets with: `earn commission`, `EPC`, `affiliates are seeing`, `promote now`, dashboard nav chrome (`Marketplace Analytics Sales & partners`).
- Keep vendor-domain boost for **claims**, but do not let vendor pages dominate the “review” half of the prompt (see §5).

#### 4c. Retarget Digistore query mix

In `digistoreEvidenceQueries`:

- Prefer: Trustpilot, Sitejabber, Reddit, BBB, scam advisors, YouTube, `{name} review|complaints|scam|refund|price`.
- Deprioritize or drop Amazon/Walmart/Target/BestBuy unless category looks physical/retail.
- Always include vendor brand queries when creator vendor is known (`digistoreVendorQueries`).

### Verify

- Sample saved sources for a Digistore product: few/no `digistore24-app.com` dashboard URLs in the top trust set.
- At least some independent hosts when public reviews exist.

---

## 5. Split claims vs independent reviews

**Status (shipped):** worker splits claim vs review sources before prompt (`splitClaimAndReviewSources`); Digistore prompt fences claim/review blocks; finalize strips affiliate chrome + vendor sales copy and clears probe-title junk when review text is unusable.

### Problem

Digistore prompt says: prioritize vendor materials; use third-party only for risk. The model then fills `positive_signals` / `common_claims` from sales and compliance pages (keyword bidding warnings, “trust us” copy).

### How

1. In the worker, split sources before prompt build:

   ```js
   const claimSources = vendorMaterials + vendor-domain web hits;
   const reviewSources = independent hosts (review / scam_advisor / reddit / youtube);
   ```

2. Update `enrichment-digistore24.txt`:

   - `common_claims` / mechanism / benefits ← vendor materials only.
   - `positive_signals` / `common_complaints` ← independent review sources only; if none, use `[]` and lower `confidence_score`.
   - Explicit ban: affiliate compliance text, keyword-bidding rules, Digistore nav chrome, commission language.

3. In `finalizeBrief` / Digistore fallback brief:

   - Strip lines matching ShadowCast-style affiliate meta markers (`commission rate`, `epc`, `promoting this`, etc.).
   - Strip Digistore chrome (`Dashboard Marketplace Analytics…`).
   - **Shipped:** `isVendorSalesCopy` in `enrichment-source-trust.mjs` scrubbed via `sanitizeNarrativeString` / video angles; Digistore thin-evidence path forces an honest “limited independent…” summary instead of offer-page pitch.

4. If `reviewSources.length === 0`:

   - Set enrichment status `complete_degraded` (or keep existing degraded path).
   - Do not invent praises from sales copy.

### Verify

- Joseph’s Well–style fixture: `positive_signals` do not contain “Don’t bid on keywords…”.
- `common_claims` may still reflect sales promises, labeled as claims.
- Unit: `server/enrichment-source-trust.test.ts`, `server/enrichment-brief-finalize.test.ts`.

---

## 6. Fetch full pages for high-trust hosts

**Status (partial):** fetch pipeline, SSRF controls, cache TTL, and candidate selection/attempt budget shipped; transcript-depth / broader host coverage still incremental. Thin/blocked pages escalate **Playwright Stealth → Jina → Firecrawl** (`REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH`, self-hosted `FIRECRAWL_BASE_URL` or cloud key). YouTube stays on the dedicated path. Stealth reduces fingerprints; it will not beat every Cloudflare wall.

### Problem

Only search snippets are stored. The LLM cannot extract real review themes from ~160 characters.

### How

1. After search + score/rank, take top N URLs where tier ∈ `{review, scam_advisor, retailer, video}` (and optionally top vendor order pages for price/refund).
2. Fetch with timeout, size cap, and User-Agent; skip PDFs/binaries.
3. Extract main text (simple readability / `@mozilla/readability` / existing HTML cleaners if present).
4. Store truncated text (e.g. 4–8k chars) on the source row or in `raw_json.content_text`.
5. Pass `excerpt` (longer than snippet) into `sourcePayload` for the LLM.
6. Rate-limit and cache by URL hash to avoid refetching on refresh jobs.
7. **Shipped:** `selectPageFetchCandidates` tier-ranks (YouTube → review/scam → video → retailer → vendor), skips permanent errors (404/410/SSRF/etc.), retries until N rich pages (`content_text` ≥ 80 chars) or attempt budget exhausted.
8. **Env:** `REVIEW_ENRICHMENT_FULL_PAGE_LIMIT` (default `6`), `REVIEW_ENRICHMENT_FULL_PAGE_MAX_ATTEMPTS` (default `18`). Worker logs success/attempt counts per product.

Start small: Trustpilot + Reddit + BBB + one vendor order page.

### Verify

- Sources with fetched content produce complaints that quote real user themes.
- Jobs still complete under timeout; failures fall back to snippet-only without crashing.
- Unit: `server/enrichment-page-fetch.test.ts`.

---

## 7. YouTube as a first-class review channel

### Problem

Info-product reviews live on YouTube more than Amazon. Classification exists (`youtu.be` / `youtube.com`) but queries are weak when the name is wrong, and no title/description enrichment beyond search.

### How

1. Add queries: `"{name} review"`, `"{name} worth it"`, `"{name} scam"`, site-restricted if the search provider supports it.
2. Boost relevance when title contains `review`, `honest`, `worth it`, `exposed`.
3. Optional later: YouTube Data API or transcript fetch for top 1–2 videos.
4. Until transcripts exist, pass full video titles + channel + search snippets as review evidence.

### Verify

- At least one YouTube hit appears in sources for well-known Digistore offers with public review videos.

---

## 8. Evidence coverage gate

### Problem

Briefs look “complete” with high confidence even when coverage is only Digistore help pages (see `evidence_coverage.has_retailer: false` with junk sources).

### How

1. Extend `evidenceCoverageFromSources` with:

   - `has_independent_review` (review/reddit/youtube tier, non-vendor)
   - `has_vendor_material`
   - `resolved_product_name`

2. In `finalizeBrief` / `saveBrief`:

   - If no independent review and no usable vendor material → `complete_degraded`, `confidence_score` capped (e.g. ≤ 40).
   - If marketplace name was unresolved → fail or degrade hard; do not write a buyer brief under `Digistore24`.

3. Surface coverage in ShadowCast import UI later (optional): warn when evidence is weak.

### Verify

- Bad Digistore identity run does not produce a confident vs_battle brief with fake competitors.

---

## 9. Re-enrich after identity fix

### Problem

Existing `product_review_briefs` were generated under wrong names. Export fixes alone leave stale `review_brief` in payloads.

### How

1. After shipping name resolution + price sanitize + competitor changes:
   ```sql
   -- Example: Digistore rows still named as marketplace brand
   UPDATE review_enrichment_jobs j
   JOIN products p ON p.id = j.product_id
   SET j.status = 'pending', j.next_run_at = NOW(), j.attempts = 0
   WHERE p.platform = 'digistore24'
     AND (p.name REGEXP '^(Digistore24?|Marketplace)$' OR j.status IN ('complete', 'complete_degraded'));
   ```
2. Or enqueue only products whose last brief `price_display` matches affiliate markers / competitors match `Top % alternative`.
3. Run `review-enrichment-worker.mjs` and spot-check 5 products end-to-end into ShadowCast.

### Verify

- New import: real product name, sane price, no synthetic competitors, praises/complaints not Digistore nav chrome.

---

## 10. ShadowCast import defense (companion)

Even with perfect APF export, harden import so bad payloads cannot refill the form.

### Status (2026-08-02)

**Shipped outside this repo** in `/home/unloved/shadowcast-/backend/apf_import.py` (+ frontend `mapBackendNormalized` in `shadowcast-/frontend/index.html`). Do not invent a ShadowCast tree inside APF.

Verified present:
1. Prefer `shadowcast_import` fields when present.
2. If name is marketplace brand, recover from `vendor_materials` (same rules as APF).
3. Sanitize price; reject EPC/commission strings.
4. Emit cleaned features into both `keyFeatures` and `key_features`.
5. Frontend `mapBackendNormalized`: prefer cleaned `key_features` list over raw `keyFeatures`.

### APF-side export defenses (this repo)

In `scripts/shadowcast-direct-lib.mjs` / Digistore extractors:
- `resolveExportProductName` / marketplace brand rejection
- `sanitizeBuyerPrice` (EPC/commission → offer-page fallback)
- affiliate chrome stripped from discount/USP/features before export
- probe-title praises/complaints cleared server-side in brief finalize before export

**Blocked without ShadowCast tree edits from APF:** changing ShadowCast UI field wiring beyond the already-shipped `mapBackendNormalized` preference. Further import hardening belongs in the ShadowCast repo.

(See plan: Digistore product info fill.)

---

## Suggested implementation slices

| Slice | Scope | Outcome | Progress |
|-------|--------|---------|----------|
| **A** | §1 + §2 + §10 | Correct name/price in export and ShadowCast form | Largely shipped |
| **B** | §3 | Real or empty competitors; no fake VS targets | Shipped + competitor buyer prices (3f) |
| **C** | §4 + §5 + §8 | Briefs stop treating affiliate chrome as reviews | Shipped — split before prompt, chrome/sales scrub, degrade gates, probe-title clear |
| **D** | §6 + §7 | Deeper review text from Trustpilot/Reddit/YouTube | Partial — probe-first fetch, Reddit JSON, YT transcript required for video rich; Trustpilot API still deferred |
| **E** | §9 | Re-enrich Digistore catalog | Blocked on flaky Brave scrape (2026-08-03). R3.9: open-web queries first + 2-strike cooldown. Engine fallbacks (`SEARXNG_FALLBACK_ENGINES`) + optional Firecrawl then Oxylabs search (last; trial ~2k results / 10 jobs/s) when primary dies. Re-run one-at-a-time with DELAY≥10s after a stable probe. |

Ship A → B before broad re-enrich (E). C can land with A/B. D is incremental.

---

## Test checklist

- [x] `resolveExportProductName(Digistore24, materials)` → Joseph’s Well / CircO2 / etc. (unit coverage in digistore extractor tests)
- [x] `sanitizeBuyerPrice(EPC headline)` → `See official offer page`
- [x] `normalizeSuggestedCompetitors([])` → `[]` (not Top/Popular/Budget placeholders)
- [x] Vendor sales-copy detection / narrative scrub (`enrichment-source-trust` + brief-finalize tests)
- [x] Page-fetch candidate selection + attempt budget (`enrichment-page-fetch` tests)
- [x] Enrichment job logs resolved name and queries using it (spot-check)
- [x] Digistore prompt fixture: no commission/EPC in `positive_signals`
- [x] APF → ShadowCast send: form identity mapping (real name + buyer price) via `resolveShadowCastFormIdentity` unit tests
- [ ] Live UI form spot-check (optional; mapping covered above)
- [ ] Re-enriched sample of 5 Digistore products audited manually (blocked on Brave health 2026-08-03; Wave E still open)

---

## Out of scope (for now)

- Full SQL backfill of every `products.name = Digistore24` (export/enrich-time resolution covers ShadowCast; optional later)
- Amazon scraper buybox price selectors (ShadowCast Amazon autofill — separate bug)
- Paid review APIs / human research ops
- Changing ShadowCast script prompts (buyer framing already handled separately)
