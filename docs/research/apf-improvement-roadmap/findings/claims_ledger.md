# Claims ledger + triangulation (Phase 5)

| Claim ID | Claim | Sources (≥3 types) | Status |
|----------|-------|-------------------|--------|
| C1 | Enrichment remains non-production for Digistore→ShadowCast briefs | 01 primary, 02 primary, 11 industry, 16 primary | **triangulated** |
| C2 | Post-audit code landed but live still 10/10 `complete_degraded` @ conf≈40; Brave rate-limits block §9 | 02 primary, 17 primary, 16 primary | **triangulated** |
| C3 | Marketplace gravity/EPC/popularity are shortlist filters, not profit proof | 06 primary, 07 primary, 08 industry | **triangulated** |
| C4 | Digistore already exposes EPC/CR/refunds for discovery; APF scorer omits refunds & hardcodes recency | 03 primary, 09 primary, 14 practitioner, 17 primary | **triangulated** |
| C5 | Cross-network discovery SaaS is crowded; APF’s documented edge is ShadowCast enriched handoff | 05 primary, 13 marketing, 10 marketing | **triangulated** (marketing bias noted) |
| C6 | For content/video pipelines, research/brief quality is the pre-creative bottleneck | 20 practitioner, 11 industry, 05 primary | **triangulated** |
| C7 | Paid-traffic affiliates often bottleneck on creative cadence more than research depth | 18 discussion, AdGPT/DIS via 18 | **triangulated** (audience-conditional) |
| C8 | Digistore daemon has session preflight; silent garbage scrape is mitigated; search ops + login friction remain | 04 primary, 19 industry, 17 primary | **triangulated** |
| C9 | Generic affiliate attrition rarely cites technical failure (≈3%) | 18 discussion | **insufficient alone** — use as opposition weight only |
| C10 | Export allows `complete_degraded` into ShadowCast | 17 primary, 01 primary | **triangulated** (code+audit; need second external N/A — flagged as internal-only but code-verified) |

## Hypothesis mapping

| H | Linked claims | Verdict draft |
|---|---------------|---------------|
| H1 | C1,C2,C6 vs C7 | **Confirm for APF→ShadowCast operator**; under-determined as universal affiliate law |
| H2 | C3,C4 | **Confirm** |
| H3 | C5,C6 vs Digistore findability pain in 18 | **Mostly confirm**; discovery UX residual pain exists but competing tools cover generic browse |
| H4 | C2,C8 vs C9 | **Partial confirm** — binding ops failure today is **search/Brave**, not Digistore session hard-fail |

## Evidence filter (Phase 5.5)

**Keep for synthesis:** C1–C8, C10.  
**Drop / demote:** C9 as sole driver of roadmap; competitor marketing claims without second type (use only for landscape).  
**Abstain:** Any claim that Digistore native sort “beats” Hidden Gem without A/B outcome data — **data-insufficient**.
