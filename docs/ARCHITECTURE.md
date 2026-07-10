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

## Key Operational Interfaces
- `pnpm db:push` for schema/migrations
- `pnpm review:*` commands for enrichment queue management
- `pnpm shadowcast:*` commands for handoff and exports
