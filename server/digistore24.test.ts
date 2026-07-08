import { describe, expect, it } from "vitest";
import { scoreDigistore24 } from "../scripts/marketplace-scoring.mjs";

describe("scoreDigistore24", () => {
  it("scores high when affiliate-ready with strong structured metrics", () => {
    const scored = scoreDigistore24({
      platform: "digistore24",
      platformProductId: "1234",
      name: "Alpha Lean",
      vendor: "Alpha Labs",
      category: "Health",
      description: "Long description with useful product details and customer outcomes.".repeat(10),
      affiliateLink: "https://checkout-ds24.com/redir/1234/UnlovedProducts",
      commissionRate: 65,
      conversionRate: 6.4,
      cartValue: 89,
      source_count: 3,
      confidence_score: 82,
      scoreComponents: JSON.stringify({ _meta: {} }),
    });
    expect(scored.score).toBeGreaterThanOrEqual(65);
  });

  it("scores lower for sparse product with no affiliate link", () => {
    const scored = scoreDigistore24({
      platform: "digistore24",
      platformProductId: "unknown",
      name: "",
      vendor: "",
      category: "",
      description: "",
      affiliateLink: "",
      source_count: 120,
      confidence_score: 0,
      scoreComponents: JSON.stringify({ _meta: {} }),
    });
    expect(scored.score).toBeLessThan(55);
  });

  it("prefers structured fields over regex fallback", () => {
    const scored = scoreDigistore24({
      platform: "digistore24",
      platformProductId: "5555",
      name: "Structured Winner",
      vendor: "Creator",
      category: "Business",
      description: "This text claims commission 10% and conversion 1% with cart value $5.",
      affiliateLink: "https://checkout-ds24.com/redir/5555/UnlovedProducts",
      commissionRate: 70,
      conversionRate: 7,
      cartValue: 120,
      source_count: 2,
      confidence_score: 80,
      scoreComponents: JSON.stringify({ _meta: {} }),
    });
    expect(scored.meta.detected_commission_percent).toBe(70);
    expect(scored.meta.detected_conversion_percent).toBe(7);
    expect(scored.meta.detected_earnings_value).toBe(120);
  });
});
