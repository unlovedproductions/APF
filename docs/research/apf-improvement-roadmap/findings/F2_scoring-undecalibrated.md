# F2 — Scoring is under-calibrated vs promote outcomes

**Thesis:** `digistore24_native_v1` hardcodes recency, ignores refunds (imports `refundCount: 0`), and can circularly boost quality from enrichment confidence — while Digistore marketplace already surfaces EPC/CR/cancellation.

**Evidence:** sources 03, 06, 07, 09, 14, 17  
**Verdict:** Confirm. Next lift = ingest refund/cancel signals + outcome feedback, not more UI polish.
