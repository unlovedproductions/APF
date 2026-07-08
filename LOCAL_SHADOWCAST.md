# Local Digistore24 -> ShadowCast Setup

## Startup Order

1. Start MySQL and ensure `DATABASE_URL` points to it.
2. Start ShadowCast on `http://localhost:8000`.
3. Optional: start SearXNG and Ollama for review enrichment.
4. Run DB migrations:
   - `pnpm db:push`
5. Start APF:
   - `pnpm local:start`
6. Start or reuse Digistore24 daemon:
   - `pnpm digistore24:daemon`

## Smoke Test

1. Sign in to APF (`/api/oauth/login`).
2. Run a ClickBank refresh (or ensure at least one scored ClickBank product exists).
3. Click **Refresh Data** on Digistore24 and complete login in Firefox if asked.
4. Wait for enrichment runs to finish (status becomes `complete` for at least one product).
5. Open a product and click **Send to ShadowCast**.
6. Confirm ShadowCast returns an open draft URL and the draft is reviewable.
7. Run script check:
   - `pnpm local:smoke-test`
