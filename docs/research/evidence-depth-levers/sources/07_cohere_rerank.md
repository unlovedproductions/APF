# Source 07 — Cohere Rerank best practices

- **Type:** vendor docs
- **Credibility:** 4
- **URL:** https://docs.cohere.com/docs/reranking-best-practices
- **Maps to:** Way 1 pre-fetch prune

## Verbatim quotes

> Scores close to `1` indicate a high relevance to the query, and scores closer to `0` indicate low relevance.

> The average of `sample_scores` can then be used as a reference when deciding a threshold for filtering out irrelevant documents.

## Why it matters

Rerank product+query against SERP snippets **before** full-page fetch. Threshold-drop low scores → fewer thin upserts and less Firecrawl spend. Optional paid API — prefer free host-tier ranking first (`FETCHABLE_TIERS`); Cohere only if spend approved.
