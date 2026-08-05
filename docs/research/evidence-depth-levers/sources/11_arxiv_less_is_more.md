# Source 11 — Less is More for RAG (arXiv 2601.17532)

- **Type:** academic
- **Credibility:** 5
- **URL:** https://arxiv.org/html/2601.17532
- **Maps to:** Way 1

## Verbatim / paraphrase of core claim

Offline relevance metrics (e.g. NDCG) show weak and non-robust correlation with generation quality; correlation can turn **negative** when multiple passages are injected.

Information Gain Pruning selects evidence by how much a passage reduces generator uncertainty, and **filters weak or negative-utility evidence before truncation**.

## Why it matters

Supports prune-first: keeping thin SERP titles in the denominator and in the LLM context hurts both DQS rich% and brief quality.
