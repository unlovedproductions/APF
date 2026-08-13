# Source 00 — Capability discovery (live stack)

- **Type:** primary (internal)
- **Accessed:** 2026-08-12
- **Credibility:** 5 | **Recency:** 5 | **Bias:** 4
- **Maps to:** H1–H4 baseline

## Verbatim / observed stack

Search: SearXNG primary (Brave scrape → Bing/DDG) → optional Brave Search API → Firecrawl `/search` → Oxylabs `google_search` last resort.

Page fetch: local HTTP → Playwright Stealth → Jina Reader → Firecrawl scrape → snippet fallback.

Reviews: Digistore `directReviewSiteCandidates` first; SERP evidence queries; Reddit `.json`; YT timedtext/transcript; claim/review split. Trustpilot API **not shipped**.

Competitors: `competitorEvidenceQueries` → extract from hits + vendor vs-copy + catalog → LLM constrained; `normalizeSuggestedCompetitors` drops synthetic placeholders; `<2` forces style off `vs_battle`/`elimination`.

Price: vendor materials / `cartValue` → `sanitizeBuyerPrice` (rejects EPC/commission). No live competitor price API.

## Relevance

Corrects outdated “Oxylabs-first / LLM-only competitors” assumptions. Residual gaps = thin SPA probes, Trustpilot API, competitor *buyer* prices, paid spy SaaS necessity.
