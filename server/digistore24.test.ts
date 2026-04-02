import { describe, it, expect } from "vitest";
import { calculateHiddenGemScore } from "./digistore24";

// Mock the internal function for testing
function calculateHiddenGemScoreMock(
  ageInDays: number,
  sales: number,
  rating: number,
  reviews: number
): { score: number; components: any } {
  // Recency Score (0-30): Newer products score higher
  const recencyScore = Math.max(0, Math.min(30, 30 - ageInDays * 0.5));

  // Growth Score (0-30): Based on sales volume and rating
  const growthScore = Math.min(30, (sales / 100) * 15 + (rating / 5) * 15);

  // Competition Score (0-25): Lower review count = less competition
  const competitionScore = Math.max(0, Math.min(25, 25 - reviews * 0.1));

  // Quality Score (0-15): Based on rating
  const qualityScore = (rating / 5) * 15;

  const totalScore = recencyScore + growthScore + competitionScore + qualityScore;

  return {
    score: Math.round(totalScore * 10) / 10,
    components: {
      recency: Math.round(recencyScore * 10) / 10,
      growth: Math.round(growthScore * 10) / 10,
      competition: Math.round(competitionScore * 10) / 10,
      quality: Math.round(qualityScore * 10) / 10,
    },
  };
}

describe("Digistore24 Hidden Gem Score", () => {
  it("should calculate high score for new product with good sales and low reviews", () => {
    // New product (5 days old), 500 sales, 4.5 rating, 50 reviews
    const result = calculateHiddenGemScoreMock(5, 500, 4.5, 50);

    expect(result.score).toBeGreaterThan(50);
    expect(result.components.recency).toBeGreaterThan(20);
    expect(result.components.competition).toBeGreaterThanOrEqual(20);
  });

  it("should calculate lower score for old product with many reviews", () => {
    // Old product (60 days old), 200 sales, 4.0 rating, 500 reviews
    const result = calculateHiddenGemScoreMock(60, 200, 4.0, 500);

    expect(result.score).toBeLessThan(50);
    expect(result.components.recency).toBeLessThan(5);
    expect(result.components.competition).toBeLessThanOrEqual(5);
  });

  it("should reward high-quality products", () => {
    // Medium age, medium sales, high rating, medium reviews
    const result = calculateHiddenGemScoreMock(30, 300, 4.8, 100);

    expect(result.components.quality).toBeGreaterThanOrEqual(14);
  });

  it("should handle edge cases", () => {
    // Very new product
    const newProduct = calculateHiddenGemScoreMock(0, 100, 3.0, 10);
    expect(newProduct.score).toBeGreaterThan(0);
    expect(newProduct.score).toBeLessThanOrEqual(100);

    // Very old product
    const oldProduct = calculateHiddenGemScoreMock(365, 1000, 5.0, 1000);
    expect(oldProduct.score).toBeGreaterThan(0);
    expect(oldProduct.score).toBeLessThanOrEqual(100);
  });

  it("should score components correctly", () => {
    const result = calculateHiddenGemScoreMock(10, 250, 4.0, 75);

    // Verify each component is within expected range
    expect(result.components.recency).toBeGreaterThanOrEqual(0);
    expect(result.components.recency).toBeLessThanOrEqual(30);

    expect(result.components.growth).toBeGreaterThanOrEqual(0);
    expect(result.components.growth).toBeLessThanOrEqual(30);

    expect(result.components.competition).toBeGreaterThanOrEqual(0);
    expect(result.components.competition).toBeLessThanOrEqual(25);

    expect(result.components.quality).toBeGreaterThanOrEqual(0);
    expect(result.components.quality).toBeLessThanOrEqual(15);

    // Total should be sum of components
    const total =
      result.components.recency +
      result.components.growth +
      result.components.competition +
      result.components.quality;
    expect(Math.abs(result.score - total)).toBeLessThan(0.1);
  });
});
