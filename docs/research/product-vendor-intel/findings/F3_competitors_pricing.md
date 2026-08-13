# F3 — Competitors and pricing methods

**Theses:**
- **H2:** Paid affiliate spy SaaS does *not* clearly beat shipped competitor retrieval for ShadowCast brief quality — default **refute / defer**.
- **H3:** Buyer pricing from offer/order + cartValue with EPC quarantine; Amazon Keepa/Rainforest misfit; open gap = competitor *buyer* prices.

**Evidence H2:** [09](../sources/09_competitor_retrieval_shipped.md), [11](../sources/11_cbsnooper.md), [12](../sources/12_eachspy.md), [13](../sources/13_profitspy.md), [20](../sources/20_prior_competitor_saas_note.md), [02](../sources/02_enrichment_improvements_docs.md)

**Evidence H3:** [08](../sources/08_sanitize_buyer_price.md), [14](../sources/14_amazon_price_apis_misfit.md), [21](../sources/21_vendor_materials_price.md), [00](../sources/00_capability_discovery.md)

**Types:** primary code + industry SaaS + prior research — triangulation OK.

## Verdicts

| ID | Verdict |
|----|---------|
| H2 | **Refute / defer** — no evidence spy SaaS improves brief competitors beyond shipped path; prior roadmap already said do-not-build AffSync clone ([20](../sources/20_prior_competitor_saas_note.md)). |
| H3 | **Confirm** — subject price path correct; competitor buyer-price rows still open; Keepa/Rainforest **do not build**. |

## Competitors — shipped baseline

Already in production ([09](../sources/09_competitor_retrieval_shipped.md)):

- `competitorEvidenceQueries` (vs / alternative / or)
- Extract from hits + vendor compare copy + catalog
- LLM constrained to candidates
- No synthetic Top/Popular/Budget names
- `<2` competitors → demote `vs_battle` / `elimination`

**Docs drift:** [`enrichment-improvements.md`](../../../enrichment-improvements.md) §3 still describes LLM-only competitors ([02](../sources/02_enrichment_improvements_docs.md)) — sync docs when implementing follow-ups; do not rebuild.

### Residual competitor improvements (free)

1. Measure empty-candidate rate; if high, add cross-network queries (`"{name}" Digistore alternative`, ClickBank gravity peers via *public* marketplace search — not paid CBSnooper).
2. Cap 2–4 validated names; keep `why` + `source_url` optional richer shape.
3. Eachspy/ProfitSpy only if spend approved for *ad angle* mining — not name discovery ([12](../sources/12_eachspy.md), [13](../sources/13_profitspy.md)).

### Paid spy SaaS (defer)

| Tool | Real job | Fit for APF briefs |
|------|----------|--------------------|
| CBSnooper / CBengine | Gravity/EPC history | Offer *selection*, not buyer competitors ([11](../sources/11_cbsnooper.md)) |
| Eachspy | FB/IG → offer graph | Creative angles ([12](../sources/12_eachspy.md)) |
| ProfitSpy | Ripper + sentiment | Overlaps scrape ladder ([13](../sources/13_profitspy.md)) |

## Pricing — better methods

### Subject product (largely shipped)

`cartValue` / vendor `structured_blocks.pricing` → `sanitizeBuyerPrice` → reject EPC ([08](../sources/08_sanitize_buyer_price.md), [21](../sources/21_vendor_materials_price.md)). Refresh job exists for Digistore backfill.

### Competitor prices (open gap — ship next when implementing)

After competitor names resolve:

1. SERP `"{competitor}" price` / offer-page fetch through existing ladder.
2. Extract short buyer prices with same `sanitizeBuyerPrice`.
3. Store beside competitor candidate (`price_display`, `source_url`).
4. Feed `price_comparison` from real numbers — not LLM filler.

### Do not build

- Keepa / Rainforest / Google Shopping monitors as Digistore primary ([14](../sources/14_amazon_price_apis_misfit.md))
- EPC / commission / “affiliates are seeing” as `price_display`
- Reintroducing synthetic competitor names
