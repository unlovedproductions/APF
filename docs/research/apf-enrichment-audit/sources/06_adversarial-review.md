# Source 06 — Adversarial review (session)

- **Type:** primary (structured review)
- **Date:** 2026-07-28
- **Verdict:** **BLOCK**

## Promoted findings

| Sev | Issue |
|-----|--------|
| CRITICAL | LLM `evidence_coverage` overrides computed gates |
| CRITICAL | Untrusted scraped HTML/transcripts injected into prompt without fencing |
| HIGH | SSRF: DNS rebinding TOCTOU + missing Azure IMDS + vendor allowlist |
| HIGH | Search suspension does not force degrade |
| HIGH | ~1430-line untested mega-worker |
| HIGH | Affiliate chrome in `review_summary` / narrative fields |
| MEDIUM | Cached content never refreshes |
| MEDIUM | File vs inline prompt drift |
| MEDIUM | Unverified `coupon_code` |
| MEDIUM | Provider errors persisted to job `error_message` |

Personas: Saboteur, New Hire, Security Auditor — each produced ≥1 finding; multi-persona hits promoted.
