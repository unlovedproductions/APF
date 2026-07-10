import { describe, expect, it } from "vitest";
import {
  calculateShareASaleScore,
  mapMerchantRow,
  mapProductRow,
  parsePipeTable,
  processProducts,
} from "./shareasale";

describe("ShareASale parsing and scoring", () => {
  it("parses pipe-delimited merchant rows with quoted delimiters", () => {
    const payload = [
      "MerchantID|OrganizationName|Categories|a30dayepc|avgsale|salecommission|reversalrate|startdate|PowerRank",
      "123|\"Acme | Fitness\"|Health & Fitness|42.5|89.99|35|2.5|2025-01-10|12",
    ].join("\n");

    const rows = parsePipeTable(payload);
    expect(rows).toHaveLength(1);

    const merchant = mapMerchantRow(rows[0]);
    expect(merchant).not.toBeNull();
    expect(merchant?.merchantId).toBe("123");
    expect(merchant?.name).toBe("Acme | Fitness");
    expect(merchant?.epc).toBe(42.5);
    expect(merchant?.avgSale).toBe(89.99);
    expect(merchant?.reversalRate).toBeCloseTo(0.025, 4);
  });

  it("throws on API error payloads", () => {
    expect(() => parsePipeTable("Error: Invalid API token")).toThrow(/error payload/i);
  });

  it("scores recent, low-reversal merchants higher on quality", () => {
    const joined = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const merchant = {
      merchantId: "777",
      name: "Quality Merchant",
      category: "Home",
      avgSale: 120,
      avgCommission: 24,
      epc: 35,
      reversalRate: 0.02,
      joined,
      powerRank: 18,
    };

    const { score, components } = calculateShareASaleScore(merchant);
    expect(score).toBeGreaterThan(45);
    expect(components.recency).toBeGreaterThanOrEqual(20);
    expect(components.quality).toBe(10);
  });

  it("maps product rows and processes SKU-level rows", () => {
    const payload = [
      "ProductID|ProductName|MerchantID|OrganizationName|Category|Price|Commission|a30dayepc|DateAdded|Keywords",
      "sku-44|Portable Blender|321|KitchenPro|Kitchen|49.95|12|18|2025-03-01|blender,smoothie",
    ].join("\n");

    const rows = parsePipeTable(payload);
    const product = mapProductRow(rows[0]);
    expect(product).not.toBeNull();
    expect(product?.productId).toBe("sku-44");
    expect(product?.merchantId).toBe("321");
    expect(product?.price).toBe(49.95);

    const processed = processProducts(product ? [product] : []);
    expect(processed).toHaveLength(1);
    expect(processed[0].platformProductId).toBe("product:sku-44");
    expect(processed[0].vendor).toBe("KitchenPro");
    expect(processed[0].hiddenGemScore).toBeGreaterThan(0);
  });
});
