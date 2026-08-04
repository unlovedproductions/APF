import { describe, expect, it } from "vitest";
import { scoreDigistore24 } from "../scripts/marketplace-scoring.mjs";

describe("scoreDigistore24 v2", () => {
  const base = {
    platform: "digistore24",
    platformProductId: "12345",
    name: "Joseph's Well",
    category: "Health",
    description: "A long enough product description for quality points. ".repeat(8),
    affiliateLink: "https://www.checkout-ds24.com/redir/12345/aff",
    commissionRate: 50,
    conversionRate: 3,
    cartValue: 40,
    source_count: 6,
  };

  it("uses digistore24_native_v2 and ignores enrichment confidence for quality", () => {
    const low = scoreDigistore24({ ...base, confidence_score: 10 });
    const high = scoreDigistore24({ ...base, confidence_score: 95 });
    expect(low.strategy).toBe("digistore24_native_v2");
    expect(high.meta.review_confidence_in_score).toBe(false);
    expect(low.components.quality).toBe(high.components.quality);
  });

  it("penalizes high refund/cancel rates from meta", () => {
    const healthy = scoreDigistore24({
      ...base,
      scoreComponents: { _meta: { detected_refund_rate: 3 } },
    });
    const risky = scoreDigistore24({
      ...base,
      scoreComponents: { _meta: { detected_refund_rate: 25 } },
    });
    expect(risky.components.quality).toBeLessThan(healthy.components.quality);
    expect(risky.meta.detected_refund_rate).toBe(25);
  });
});
