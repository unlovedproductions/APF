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

## Replacing synthetic (generated) promolinks

Importer/backfill may create `product_affiliate_links.status=generated` synthetic URLs. Live approved promolinks require a logged-in Digistore24 Firefox session.

1. Start the daemon: `pnpm digistore24:daemon`
2. Log in via Firefox: `pnpm digistore24:login` (or use **Refresh Data** in APF and complete login/2FA in the opened window)
3. Re-collect with promote enabled (any of):
   - APF UI **Refresh Data** when `DIGISTORE24_AUTO_PROMOTE=true` in `.env` (default in `.env.example`)
   - CLI: `node scripts/digistore24-daemon-client.mjs collect --ensure --promote --limit 50`
4. On success the daemon updates `products.affiliateLink` and upserts `product_affiliate_links` with `status=approved`, replacing prior `generated` rows for the same product/provider/nickname.

Verify:

```sql
SELECT p.id, p.name, l.status, l.affiliate_url
FROM products p
JOIN product_affiliate_links l ON l.product_id = p.id
WHERE p.platform = 'digistore24' AND l.status = 'generated';
```

Re-run step 3 until this query returns no rows (or only products still awaiting manual vendor approval).
