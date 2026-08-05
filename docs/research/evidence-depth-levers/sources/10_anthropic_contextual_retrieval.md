# Source 10 — Anthropic Contextual Retrieval

- **Type:** industry / engineering
- **Credibility:** 5
- **URL:** https://www.anthropic.com/engineering/contextual-retrieval
- **Maps to:** Way 1 + grounding pattern

## Verbatim quotes

> Reranking provides better responses and reduces cost and latency because the model is processing less information.

> Reranked Contextual Embedding and Contextual BM25 reduced the top-20-chunk retrieval failure rate by 67% (5.7% → 1.9%).

## Why it matters

Explicit stack: over-retrieve → rerank → keep top-K. Maps to APF: do not ground briefs on 40 thin SERP snippets; enrich a small set of long reviews/transcripts, then synthesize.
