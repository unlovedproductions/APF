# APF Architecture

## Intent
APF discovers affiliate products, scores them, enriches product intelligence, and prepares payloads for ShadowCast.

## Runtime Components
- Frontend and backend run from one Node.js workspace (`pnpm local:start` / `pnpm dev`).
- Route pages are code-split via `React.lazy` in `client/src/App.tsx` to keep the initial bundle small.
- Database persistence via MySQL (`drizzle-orm`, `drizzle-kit` migration flow).
- Product and enrichment workers run via scripts in `package.json`.
- Optional Sentry: Express (`SENTRY_DSN`) + React client (`VITE_SENTRY_DSN`).

## External Integrations
- ShadowCast (`SHADOWCAST_BASE_URL`) for direct handoff.
- Review enrichment search/fetch ladder: SearXNG (+ `SEARXNG_FALLBACK_ENGINES`) → optional Firecrawl (`FIRECRAWL_BASE_URL` preferred, or cloud BYOK) → Oxylabs SERP last; full-page escalate Playwright stealth → Jina → Firecrawl; Ollama for summarization.
- Marketplace data collectors (including Digistore browser daemon scripts).
- Optional Trustpilot Business Units API (`TRUSTPILOT_API_KEY`) via `pnpm review:trustpilot`.

## Data Flow (high level)
1. Product ingestion/refresh from marketplace collectors.
2. Hidden-gem scoring and metadata normalization (`digistore24_native_v2` for Digistore).
3. Enrichment queue processing to produce review briefs (including `claim_ledger`).
4. Optional promote-outcome calibration from real campaign results.
5. Direct ShadowCast handoff or JSON export (`complete` briefs only by default).

## Database Schema

Schema source of truth: [`drizzle/schema.ts`](../drizzle/schema.ts). Migrations live in [`drizzle/`](../drizzle/).

Analysis artifacts (generated via database-designer skill tools):
- [`docs/database/apf_schema.sql`](database/apf_schema.sql) — consolidated DDL
- [`docs/database/schema_analysis.json`](database/schema_analysis.json) — normalization/constraint audit + Mermaid ERD
- [`docs/database/apf_query_patterns.json`](database/apf_query_patterns.json) — hot query patterns for index tuning
- [`docs/database/index_recommendations.json`](database/index_recommendations.json) — applied index plan

Key tables: `products`, `product_review_briefs` (includes `claim_ledger`), `review_enrichment_jobs`, `product_vendor_materials`, `vendor_profiles`, `product_promote_outcomes`.

Performance indexes added in migration `0005_apf_performance_indexes` (composite `products(userId, platform, hiddenGemScore)`, enrichment queue index, affiliate/review/vendor indexes).

Runtime scripts no longer bootstrap DDL — run `pnpm db:push` before workers/daemons.

## Digistore24 Browser Automation

All Digistore24 login/collect/session scripts share one Firefox profile (`DIGISTORE24_BROWSER_PROFILE` or `~/.config/unloved-digistore24-firefox-profile`):

- `pnpm run digistore24:login` — save session (Firefox)
- `pnpm run digistore24:session:check` — verify session
- `pnpm run digistore24:daemon` — production collector (selector-based waits, session preflight)
- Scoring: `digistore24_native_v2` (refund/cancel in quality; enrichment confidence excluded)

## Key Operational Interfaces
- `pnpm db:push` for schema/migrations
- `pnpm review:status` / `review:once` / `review:requeue-digistore24` — enrichment queue
- `pnpm review:dqs` / `review:prune-thin` / `review:depth-backfill` / `review:trustpilot` — enrichment quality ops
- `pnpm promote:outcome` / `promote:calibrate` / `promote:outcomes:list` — campaign calibration
- `pnpm digistore:refresh-names` — placeholder name repair
- `pnpm shadowcast:*` / `pnpm local:smoke-test` — handoff and exports
