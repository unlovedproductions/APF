# Source 08 — Trustpilot Business Units API

- **Type:** primary (official API)
- **Credibility:** 5
- **URL:** https://developers.trustpilot.com/business-units-api
- **Maps to:** Way 3

## Verbatim / schema notes

> Get a list of all reviews for a business unit. Use pageToken to paginate through reviews.

Response includes per-review `"text"` (and `"title"`) on business-unit review endpoints.

## Why it matters

Structured long-form review text by design — near-guaranteed ≥50 chars when reviews exist. Prefer official API (key) over brittle HTML scrape of Trustpilot pages. Commercial access may require Trustpilot Data Solutions; start with existing HTML direct probes if key unavailable.
