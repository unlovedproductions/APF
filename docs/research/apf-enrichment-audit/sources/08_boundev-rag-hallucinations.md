# Source 08 — Reduce LLM hallucinations in production RAG

- **URL:** https://www.boundev.ai/blog/reduce-llm-hallucinations-production-rag
- **Type:** industry
- **Credibility / Recency / Bias:** 3 / 4 / 2

## Key practices cited

- Grounding verifier as a **second** model/system — writer must not be sole judge
- Confidence thresholds → fallback / abstain when evidence weak
- Fixed regression set of trap questions where correct action is abstain

## Relevance to APF

`finalizeBrief` currently merges LLM coverage into the gate that judges the LLM. Industry pattern: compute support server-side (or with a separate verifier), then cap/abstain. Matches critical adversarial finding.
