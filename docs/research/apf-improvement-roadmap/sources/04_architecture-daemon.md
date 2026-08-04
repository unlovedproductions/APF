# Source 04 — Architecture + Digistore daemon

- **URL/path:** docs/ARCHITECTURE.md; scripts/digistore24-browser-daemon.mjs
- **Type:** primary (docs/code)
- **Accessed:** 2026-08-04
- **Credibility:** 5 | **Recency:** 5 | **Bias:** 3

## Verbatim quotes

> Digistore24 (Firefox daemon): Logged-in Firefox session collects affiliate marketplace products… (README)
> Digistore24 session expired — run: pnpm run digistore24:login
> Digistore24 marketplace not ready — complete login in Firefox or run: pnpm run digistore24:session:check
> Digistore24 session preflight ok (… marketplace links visible).

## Relevance

Supports H4: ingest path depends on interactive Firefox session continuity; hard-fail on expiry is good, but human login is a single point of ops failure.
