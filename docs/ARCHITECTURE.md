# APF Architecture

## Intent
APF discovers affiliate products, scores them, enriches product intelligence, and prepares payloads for ShadowCast.

## Runtime Components
- Frontend and backend run from one Node.js workspace (`pnpm local:start` / `pnpm dev`).
- Database persistence via MySQL (`drizzle-orm`, `drizzle-kit` migration flow).
- Product and enrichment workers run via scripts in `package.json`.

## External Integrations
- ShadowCast (`SHADOWCAST_BASE_URL`) for direct handoff.
- SearXNG + Ollama for review enrichment workflows.
- Marketplace data collectors (including Digistore browser daemon scripts).

## Data Flow (high level)
1. Product ingestion/refresh from marketplace collectors.
2. Hidden-gem scoring and metadata normalization.
3. Enrichment queue processing to produce review briefs.
4. Direct ShadowCast handoff or JSON export.

## Database Schema

Schema source of truth: [`drizzle/schema.ts`](../drizzle/schema.ts). Migrations live in [`drizzle/`](../drizzle/).

Analysis artifacts (generated via database-designer skill tools):
- [`docs/database/apf_schema.sql`](database/apf_schema.sql) — consolidated DDL
- [`docs/database/schema_analysis.json`](database/schema_analysis.json) — normalization/constraint audit + Mermaid ERD
- [`docs/database/apf_query_patterns.json`](database/apf_query_patterns.json) — hot query patterns for index tuning
- [`docs/database/index_recommendations.json`](database/index_recommendations.json) — applied index plan

Key tables: `products`, `product_review_briefs`, `review_enrichment_jobs`, `product_vendor_materials`, `vendor_profiles`.

Performance indexes added in migration `0005_apf_performance_indexes` (composite `products(userId, platform, hiddenGemScore)`, enrichment queue index, affiliate/review/vendor indexes).

Runtime scripts no longer bootstrap DDL — run `pnpm db:push` before workers/daemons.

## Digistore24 Browser Automation

All Digistore24 login/collect/session scripts share one Firefox profile (`DIGISTORE24_BROWSER_PROFILE` or `~/.config/unloved-digistore24-firefox-profile`):

- `pnpm run digistore24:login` — save session (Firefox)
- `pnpm run digistore24:session:check` — verify session
- `pnpm run digistore24:daemon` — production collector (selector-based waits, session preflight)

## Key Operational Interfaces
- `pnpm db:push` for schema/migrations
- `pnpm review:*` commands for enrichment queue management
- `pnpm shadowcast:*` commands for handoff and exports
