# APF Enrichment Audit Report — 2026-07-28

**Genre:** validation  
**Entity:** APF review enrichment (Digistore-heavy sample)  
**Deliverables:** this folder · Canvas · chat briefing

---

## Verdict

**Not production-ready for Digistore → ShadowCast buyer briefs.**

Slices A–C in `docs/enrichment-improvements.md` largely landed in code (identity resolve, price sanitize, competitor kill-switch, trust tiers, claim/review split scaffolding, coverage fields). Live data (n=10 Digistore briefs, 218 sources) shows the **remaining failure mode is narrative + gating integrity**, not missing feature flags.

**Dossier hypothesis: CONFIRMED.**

Adversarial subsystem verdict: **BLOCK**.

---

## Scores

| Layer | Score | Band |
|-------|------:|------|
| **Enrichment System Score** | **56 / 100** | Remediation required |
| Data Quality Score (DQS) | **67 / 100** | Usable with caveats |
| Architecture / gates (code) | 72 | Gates exist |
| Live semantic validity | 40 | Narratives poisoned |
| Adversarial posture | 25 | 2 criticals |
| Test coverage (enrichment) | 45 | Helpers only |

### DQS breakdown (data-quality-auditor weights)

| Dimension | Weight | Score | Notes |
|-----------|-------:|------:|-------|
| Completeness | 30% | 78 | Columns filled; `positive_signals` often `[]`; no `content_text` |
| Consistency | 25% | 52 | `products.name=Digistore24` vs resolved brief names; `vs_battle` with weak competitors |
| Validity | 20% | 38 | Affiliate chrome in summaries/complaints; confidence theater |
| Uniqueness | 15% | 88 | No dup (product,url); cross-product URL reuse OK |
| Timeliness | 10% | 95 | All briefs &lt;7d |

**DQS = 0.30×78 + 0.25×52 + 0.20×38 + 0.15×88 + 0.10×95 ≈ 67**

### Enrichment System Score formula (locked)

`0.35×architecture + 0.35×DQS + 0.20×adversarial_posture + 0.10×test_coverage`  
= 0.35×72 + 0.35×67 + 0.20×25 + 0.10×45 ≈ **56**

---

## Hypothesis verdicts

| ID | Verdict | Evidence |
|----|---------|----------|
| **H1 Identity leakage** | **Partial confirm** | EPC price 0; synthetic competitors 0; **products.name still Digistore24 for 10/10**; resolved names on briefs OK |
| **H2 Evidence theater** | **Confirm** | 9/10 conf ≥55 with no independent review; 1× conf 82 + `has_indep=true` with summary “Trust us…” |
| **H3 Trust/fetch gap** | **Confirm** | 0/218 `content_text`; complaints/summaries filled with vendor/compliance/nav chrome |
| **H4 Ops fragility** | **Partial** | Jobs all `complete`, 9/10 correctly `complete_degraded`; search suspension only logged; degrade still exports junk narrative |

---

## What already works (do not re-litigate)

- `sanitizeBuyerPrice` — no EPC prices in live briefs
- `normalizeSuggestedCompetitors` — no “Top … alternative” strings
- Digistore name resolution into brief `resolved_product_name`
- Host trust classification + Digistore query mix scaffolding
- Zod coerce path + unit tests for coerce / page-fetch / trust
- SSRF baseline (scheme/credentials/private DNS/manual redirects) — incomplete but present
- Queue hygiene: no stale `running` jobs in sample

---

## Critical gaps (prioritized)

### P0 — Ships bad briefs / security

1. **Never trust LLM `evidence_coverage` booleans** — compute only from sources/materials; use for caps + `complete_degraded` exclusively. (`finalizeBrief` merge order)
2. **Fence untrusted excerpts in prompts**; treat scraped HTML as DATA NOT INSTRUCTIONS.
3. **Strip affiliate meta on all narrative fields** (`review_summary`, audiences, CTA, price_comparison) — not just signal arrays. Reject/rewrite when summary matches compliance/nav patterns.
4. **SSRF harden:** pin resolved IP / anti-rebinding; block `168.63.129.16`; re-check redirects.

### P1 — Silent quality

5. **Diagnose 0/218 `content_text`** — fetch failing vs not persisted; fix + metric.
6. **Force degrade (or fail) when `searchSuspensionSeen`** or zero review-tier hits after search.
7. **Persist `products.name`** for all successful Digistore resolves; requeue §9.
8. **Server-enforce** empty `positive_signals`/`common_complaints` when `reviewSources.length===0` (already prompted; not enforced).

### P2 — Ops / coverage

9. Extract `finalizeBrief` / `processJob` degrade paths into testable modules; add regression fixtures from live junk summaries.
10. Eliminate file vs `INLINE_PROMPTS` drift (single source of truth).
11. Content cache TTL / invalidate on refresh.
12. Block inventable `coupon_code` unless present in vendor materials.

### P3 — Nice-to-have

13. YouTube transcript depth / Data API
14. ShadowCast import defense companion (§10)
15. Broader affiliate-noise host list

---

## Adversarial summary

**Verdict: BLOCK**  
Critical compound: prompt injection surface + LLM-writable evidence gates.  
Full list: `sources/06_adversarial-review.md`.

---

## External triangulation (practice gap)

Industry RAG/editorial practice separates (1) retrieval, (2) generation, (3) grounding/abstention judgment. Affiliate editorial sites weight brand marketing ~0.1 vs independent reviews. APF implements split in prompts/helpers but lets the generator grade its own evidence and leaves brand chrome in buyer-facing narrative fields — opposite of abstention-first design (`sources/07–11`).

---

## Sample size caveat

Live N=10 Digistore products only. Rates are directional for this catalog slice, not global APF. Re-run `refresh_targets.md` after fixes.

---

## Recommended next engineering slice (single batch)

1. Fix coverage merge (server-only flags)  
2. Narrative affiliate strip + empty-independent enforcement  
3. Unit tests on `finalizeBrief` with Joseph’s Well / Genius Wave fixtures  
4. content_text persist investigation  

Do **not** broad re-enrich (§9) until P0–P1 land — you will mint more junk at scale.

---

## Post-fix status (2026-08-03)

**Code:** Audit P0–P2 + R3.8 search pin/circuit/cooldown/probes-first shipped (`0ad7927`). Claim/review split before prompt is live; slice C docs corrected.

**Live Digistore (n=10):** `0 complete` / `10 complete_degraded` / avg confidence **40**. Rich `content_text≥80` still present on several products via probes+fetch.

**Blocker:** SearXNG Brave scrape returns `too many requests` / connection errors. Catalog re-enrich (§9) and adversarial **BLOCK → re-score** wait on healthy `engines=brave` probe.

**Deferred (optional):** tighter review-body extraction so probe HTML chrome cannot dominate claims.
