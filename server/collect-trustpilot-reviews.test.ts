import { describe, expect, it } from "vitest";
import {
  reviewToSource,
  scoreBusinessUnit,
} from "../scripts/collect-trustpilot-reviews.mjs";

describe("collect-trustpilot-reviews", () => {
  it("scores business units by product-name token overlap and demotes marketplaces", () => {
    const product = "CircO2 Nitric Oxide Booster";
    const good = scoreBusinessUnit(
      {
        displayName: "CircO2 Official",
        name: { identifying: "circo2.com", referring: ["circo2"] },
      },
      product,
    );
    const noise = scoreBusinessUnit(
      {
        displayName: "Digistore24",
        name: { identifying: "digistore24.com", referring: [] },
      },
      product,
    );
    expect(good).toBeGreaterThan(noise);
    expect(good).toBeGreaterThanOrEqual(2);
  });

  it("maps Trustpilot API reviews to rich product_review_sources rows", () => {
    const source = reviewToSource(
      { id: 9 },
      {
        id: "abc123",
        title: "Works as advertised",
        text: "I used CircO2 for two weeks and noticed better workouts and recovery.",
        stars: 5,
        isVerified: true,
        language: "en",
        createdAt: "2026-01-01T00:00:00Z",
        consumer: { displayName: "Alex" },
      },
      { id: "bu1", name: { identifying: "circo2.com" } },
    );
    expect(source.url).toBe("https://www.trustpilot.com/reviews/abc123");
    expect(source.raw_json.fetch_provider).toBe("trustpilot_api");
    expect(source.raw_json.content_text.length).toBeGreaterThanOrEqual(50);
    expect(source.sentiment).toBe("positive");
    expect(source.trust_score).toBe(88);
  });
});
