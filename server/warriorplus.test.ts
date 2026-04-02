import { describe, expect, it } from "vitest";
import { calculateHiddenGemScore, processOffers } from "./warriorplus";

describe("Hidden Gem Scoring", () => {
  it("should score recent products with low sales higher", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentProduct = {
      id: "offer_1",
      name: "New AI Tool",
      created: yesterday.toISOString(),
      status: "active",
      sale_cnt: 10,
      aggregate_sales: "500",
      refund_cnt: 0,
    };

    const { score, components } = calculateHiddenGemScore(recentProduct, [recentProduct]);

    // Recent + low sales + low refund = high score
    expect(score).toBeGreaterThan(50);
    expect(components.recency).toBeGreaterThanOrEqual(20);
    expect(components.growth).toBeGreaterThanOrEqual(20);
  });

  it("should penalize old products with high sales", () => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const oldProduct = {
      id: "offer_2",
      name: "Established Product",
      created: sixMonthsAgo.toISOString(),
      status: "active",
      sale_cnt: 5000,
      aggregate_sales: "100000",
      refund_cnt: 500,
    };

    const { score, components } = calculateHiddenGemScore(oldProduct, [oldProduct]);

    // Old + high sales + high refund rate = low score
    expect(score).toBeLessThan(30);
    expect(components.recency).toBe(0);
    expect(components.growth).toBeLessThan(10);
  });

  it("should identify hidden gems with moderate sales and low competition", () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const hiddenGem = {
      id: "offer_3",
      name: "Hidden Gem Product",
      created: tenDaysAgo.toISOString(),
      status: "active",
      sale_cnt: 25,
      aggregate_sales: "1250",
      refund_cnt: 1,
    };

    const { score, components } = calculateHiddenGemScore(hiddenGem, [hiddenGem]);

    // Recent + moderate sales + low velocity + good quality = high score
    expect(score).toBeGreaterThan(60);
    expect(components.competition).toBeGreaterThan(15);
    expect(components.quality).toBeGreaterThan(10);
  });

  it("should handle products with no sales", () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const noSalesProduct = {
      id: "offer_4",
      name: "Brand New Product",
      created: threeDaysAgo.toISOString(),
      status: "active",
      sale_cnt: 0,
      aggregate_sales: "0",
      refund_cnt: 0,
    };

    const { score, components } = calculateHiddenGemScore(noSalesProduct, [noSalesProduct]);

    // Recent + no sales yet = moderate score (potential)
    expect(score).toBeGreaterThan(30);
    expect(components.recency).toBeGreaterThanOrEqual(20);
  });

  it("should calculate quality score based on refund rate", () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Low refund rate (2%)
    const qualityProduct = {
      id: "offer_5",
      name: "Quality Product",
      created: sevenDaysAgo.toISOString(),
      status: "active",
      sale_cnt: 100,
      aggregate_sales: "5000",
      refund_cnt: 2,
    };

    const { components: qualityComponents } = calculateHiddenGemScore(qualityProduct, [qualityProduct]);
    expect(qualityComponents.quality).toBe(15); // Best quality score

    // High refund rate (25%)
    const poorQualityProduct = {
      id: "offer_6",
      name: "Poor Quality Product",
      created: sevenDaysAgo.toISOString(),
      status: "active",
      sale_cnt: 100,
      aggregate_sales: "5000",
      refund_cnt: 25,
    };

    const { components: poorComponents } = calculateHiddenGemScore(poorQualityProduct, [poorQualityProduct]);
    expect(poorComponents.quality).toBe(0); // No quality score
  });

  it("should process offers into standardized format", () => {
    const offers = [
      {
        id: "offer_1",
        name: "AI Marketing Tool",
        created: new Date().toISOString(),
        status: "active",
        sale_cnt: 15,
        aggregate_sales: "750",
        refund_cnt: 0,
        offer_meta: {
          keywords: ["ai", "marketing", "automation"],
          marketing_keywords: ["artificial intelligence"],
        },
      },
    ];

    const processed = processOffers(offers);

    expect(processed).toHaveLength(1);
    expect(processed[0].name).toBe("AI Marketing Tool");
    expect(processed[0].category).toBe("AI Tools");
    expect(processed[0].keywords).toContain("ai");
    expect(processed[0].hiddenGemScore).toBeGreaterThan(0);
    expect(processed[0].scoreComponents).toBeDefined();
  });

  it("should extract correct categories from keywords", () => {
    const testCases = [
      {
        keywords: ["affiliate", "jv"],
        expectedCategory: "Affiliate Marketing",
      },
      {
        keywords: ["chatgpt", "ai"],
        expectedCategory: "AI Tools",
      },
      {
        keywords: ["shopify", "ecommerce"],
        expectedCategory: "E-commerce",
      },
      {
        keywords: ["seo", "ranking"],
        expectedCategory: "SEO",
      },
    ];

    testCases.forEach(({ keywords, expectedCategory }) => {
      const offer = {
        id: "test_offer",
        name: "Test Product",
        created: new Date().toISOString(),
        status: "active",
        sale_cnt: 10,
        offer_meta: { keywords },
      };

      const processed = processOffers([offer]);
      expect(processed[0].category).toBe(expectedCategory);
    });
  });
});
