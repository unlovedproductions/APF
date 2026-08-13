# Product / Vendor / Review / Competitor Intel — Plan

**Slug:** `product-vendor-intel`  
**Date:** 2026-08-12  
**Genre:** landscape + decision  
**Depth:** deep  
**Constraint:** Research artifact only — no production code in this pass.

## Decision

Which methods and channels should APF adopt next to improve (1) product/vendor page intelligence, (2) independent customer reviews, and (3) real competitors + buyer pricing for Digistore24/ClickBank → ShadowCast — without inventing narrative, without unpaid SaaS creep, and without Amazon-retail tooling that does not fit digital affiliate offers.

## Reframed question

Given the *already-shipped* SearXNG→fetch ladder, competitor retrieval, and price sanitize path, what residual methods raise review substance and competitor *price* quality fastest?

## Falsifiable hypotheses

| ID | Claim |
|----|--------|
| H1 | Specialized review corpora (Trustpilot API text, Reddit `.json`, YT transcripts) beat generic SERP scrape volume for usable review substance. |
| H2 | Paid affiliate spy SaaS (CBSnooper, ProfitSpy, Eachspy) adds material competitor quality beyond shipped retrieval+validation — default expectation: refute / defer. |
| H3 | Buyer pricing is best from offer/order pages + cart fields; EPC must stay quarantined; competitor *buyer-price* rows remain an open gap (not Keepa/Rainforest). |
| H4 | Scrape quality is gated more by identity + fetch ladder + host trust than by swapping Firecrawl for another generic scraper API. |

## Prior work (reuse)

- `docs/research/evidence-depth-levers/` — Ways 1–3, Trustpilot/YT/probes
- `docs/research/apf-enrichment-audit/` — thin content, chrome, confidence theater
- `docs/research/apf-improvement-roadmap/` — competitor SaaS note, Digistore identity
- `docs/enrichment-improvements.md` — spec vs ship status

## Sourcing strategy

1. Primary internal: worker, page-fetch ladder, competitor extractors, sanitizeBuyerPrice
2. Vendor docs: Firecrawl, Trustpilot, Jina, Oxylabs, YT transcripts
3. Industry: affiliate spy tools, scraping API comparisons (biased)
4. Discussion/risk: Sitejabber FTC consent order; ToS risks
5. Opposition: spy SaaS necessity; Amazon price APIs; rich% vs substance

Triangulation: ≥3 differently-typed sources per thesis.

## Opposition queries

- Does paid spy SaaS beat shipped competitor retrieval?
- Are Keepa/Rainforest relevant to Digistore info products?
- Is swapping scraper vendors higher leverage than Trustpilot API + transcripts?
- Does creative cadence beat enrichment for affiliates?

## Risk register

| Risk | Mitigation |
|------|------------|
| Re-researching evidence-depth-levers | Cite prior sources; focus residual gaps |
| Vendor-blog bias on scraper APIs | Score bias low; require non-vendor triangulation |
| Sitejabber as “review truth” | FTC consent order → downgrade trust |
| Paid SaaS creep | Free Phase A first; defer Apify/spy tools |
| Docs drift (competitors “LLM-only”) | Treat code as shipped; sync docs as follow-up |

## Stop criteria

- Folder complete with sources, findings F1–F3, decision report, refresh_targets
- H1–H4 verdicted; adversarial pass recorded
- No production code changed

## Changelog

- 2026-08-12: Investigation opened and completed in one pass (plan approval).
