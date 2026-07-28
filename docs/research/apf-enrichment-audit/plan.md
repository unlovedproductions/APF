# APF Enrichment Audit — Plan

**Slug:** `apf-enrichment-audit`  
**Date:** 2026-07-28  
**Genre:** validation + decision (remediation priority)  
**Depth:** medium

## Decision

Should APF enrichment be treated as production-ready for Digistore → ShadowCast handoff, and which gaps must close before catalog re-enrich?

## Dossier hypothesis

Digistore enrichment still ships degraded briefs into ShadowCast when product identity, affiliate chrome, or thin independent evidence slips past coerce/finalize — residual gaps remain after slices documented in `docs/enrichment-improvements.md`.

## Falsifiable hypotheses

| ID | Claim |
|----|--------|
| H1 | Material Digistore briefs still show marketplace brand names, EPC-as-price, or synthetic competitors. |
| H2 | Confidence scores are often high relative to evidence coverage (missing independent review). |
| H3 | High-trust page fetch + claim/review split fail on thin corpora; affiliate chrome still reaches narrative fields. |
| H4 | Queue/daemon/search failure modes produce silent “done” states with hollow evidence. |

## Sourcing strategy

1. Primary: live MySQL aggregates (`product_review_briefs`, `product_review_sources`, `review_enrichment_jobs`, `products`).
2. Primary: enrichment code + tests + `docs/enrichment-improvements.md`.
3. Adversarial: three-persona review of enrichment modules.
4. Secondary/external: RAG faithfulness / editorial claim-vs-vendor separation practices (3–6 sources).

## Opposition queries

- What works well in current Digistore gates?
- Which doc slices are already implemented and should not be re-litigated?
- Is live sample size (n=10 Digistore) enough to generalize?

## Risk register

| Risk | Mitigation |
|------|------------|
| Small live N | Label sample size; prefer rate metrics over absolute claims |
| Secrets in .env | Never print connection strings; query via Node loader only |
| Over-citing blogs | Prefer primary code + live SQL; external sources secondary |

## Stop criteria

- Hypotheses confirmed/refuted/under-determined with ≥2 evidence types each
- DQS + Enrichment System Score computed
- Adversarial verdict issued
- Folder + canvas + chat briefing delivered

## Changelog

- 2026-07-28: Initial investigation executed.
