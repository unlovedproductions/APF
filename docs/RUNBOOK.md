# APF Runbook

## Service Summary
- App: APF
- Default URL: `http://localhost:3000`
- Primary command: `pnpm local:start`

## Startup
1. Ensure dependencies are installed:
   - `pnpm install`
2. Ensure MySQL is available and env values are present.
3. Apply schema:
   - `pnpm db:push`
4. Start APF:
   - `pnpm local:start`
5. If using Digistore browser collector:
   - `pnpm digistore24:daemon`

## Daily Operations
- Check enrichment queue:
  - `pnpm review:status`
- Process one queue cycle manually:
  - `pnpm review:once`
- Requeue Digistore products if needed:
  - `pnpm review:requeue-digistore24`
- ShadowCast handoff smoke test:
  - `pnpm local:smoke-test`

## Health Checks
- Type checks:
  - `pnpm check`
- HTTP reachability:
  - `curl -fsS http://localhost:3000 >/dev/null`
- Optional daemon logs:
  - `pnpm review:daemon:logs`

## Shutdown
- Stop APF terminal process (`Ctrl+C`).
- Stop daemon process (`Ctrl+C`) if running in a separate terminal.

## Common Failures
- DB connection failures: verify MySQL and `DATABASE_URL`.
- Enrichment stalls: check SearXNG/Ollama reachability and `pnpm review:status`.
- ShadowCast send failures: verify `SHADOWCAST_BASE_URL` and shared `INTERNAL_SERVICE_SECRET`.
