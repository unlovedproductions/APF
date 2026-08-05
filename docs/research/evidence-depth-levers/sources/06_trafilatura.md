# Source 06 — Trafilatura

- **Type:** OSS docs
- **Credibility:** 5
- **URL:** https://trafilatura.readthedocs.io/en/latest/
- **Maps to:** Way 1 extract gate

## Verbatim quotes

> Going from raw HTML to essential parts can alleviate many problems related to text quality, by avoiding the noise caused by recurring elements like headers and footers

> The extractor strikes a balance between limiting noise (precision) and including all valid parts (recall).

## Why it matters

Chrome-only HTML can “succeed” as a fetch but fail as evidence. Main-content length &lt;50 → treat as thin and **exclude from rich cohort / prune candidates**. APF already uses Cheerio main-text; Trafilatura is the reference standard for the gate, not a mandatory new dependency.
