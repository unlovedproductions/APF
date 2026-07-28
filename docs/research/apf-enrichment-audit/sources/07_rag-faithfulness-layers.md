# Source 07 — RAG faithfulness layers (citation / confidence / abstention)

- **URL:** https://www.bestaiweb.ai/citation-generation-confidence-scoring-and-abstention-the-components-of-rag-faithfulness-systems/
- **Type:** industry
- **Credibility / Recency / Bias:** 3 / 4 / 2

## Verbatim / close quotes

> “citation correctness is not citation faithfulness”

> “Abstention answers should we be saying anything at all.”

## Relevance to APF

APF stores sources and a confidence number but does not claim-verify brief fields against retrieved excerpts. High confidence with hollow/independent-missing evidence is exactly the failure mode abstention is meant to stop. Server-side coverage must drive abstain/degrade — not the generator’s self-reported `evidence_coverage`.
