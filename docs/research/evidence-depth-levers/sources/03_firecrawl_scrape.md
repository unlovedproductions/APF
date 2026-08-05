# Source 03 — Firecrawl scrape tutorial

- **Type:** vendor docs / blog
- **Credibility:** 4
- **URL:** https://www.firecrawl.dev/blog/mastering-firecrawl-scrape-endpoint
- **Maps to:** Way 2

## Verbatim quotes

> It converts pages into LLM-ready markdown while handling the hard parts like proxies, caching, rate limits, and JavaScript-rendered content.

> The fetch happens in a real browser, so anything a normal user's browser would handle (JavaScript-rendered content, redirects, login flows) is already taken care of.

## Why it matters

Local Cheerio/HTTP often returns empty/nav chrome on review SPAs. Firecrawl scrape is the existing BYOK path (`FIRECRAWL_API_KEY`, default max **3** scrapes/job) to convert thin local failures into long `content_text`.
