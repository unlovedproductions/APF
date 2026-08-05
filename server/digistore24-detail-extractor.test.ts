import { describe, expect, it } from "vitest";
import {
  extractDigistore24Detail,
  extractBuyerPriceFromVendorMaterials,
  isMarketplaceBrandName,
  resolveExportProductName,
  resolveProductName,
  sanitizeBuyerPrice,
} from "../scripts/digistore24-detail-extractor.mjs";

describe("digistore24 detail extractor", () => {
  it("rejects marketplace brand titles", () => {
    const detail = extractDigistore24Detail({
      title: "Digistore24",
      body: "Vendor: Acme Labs\nCategory: Health\nUseful description here.",
    });
    expect(detail.title).toBe("");
    expect(isMarketplaceBrandName("Digistore24")).toBe(true);
    expect(isMarketplaceBrandName("Digistore24 Product 54669")).toBe(true);
    expect(resolveProductName("Digistore24", "Alpha Lean Formula", "123")).toBe("Alpha Lean Formula");
  });

  it("parses vendor from multiline body", () => {
    const detail = extractDigistore24Detail({
      title: "Alpha Lean Formula",
      body: "Vendor: Acme Labs\nCategory: Health\nMore text",
    });
    expect(detail.vendor).toBe("Acme Labs");
    expect(detail.category).toBe("Health");
  });

  it("parses vendor from collapsed single-line body", () => {
    const detail = extractDigistore24Detail({
      title: "Alpha Lean Formula",
      body: "Promote now Vendor: Acme Labs Category: Health Commission 50%",
    });
    expect(detail.vendor).toBe("Acme Labs");
  });

  it("scrubs marketplace vendor names", () => {
    const detail = extractDigistore24Detail({
      title: "Some Product",
      body: "Vendor: Digistore24\nCategory: Misc",
    });
    expect(detail.vendor).toBe("");
  });

  it("resolves export product name from vendor materials", () => {
    expect(
      resolveExportProductName(
        { name: "Digistore24", platformProductId: "54669" },
        [
          { source_type: "sales_page", title: "Compliance Guidelines (Read Before Launch)" },
          { source_type: "order_page", title: "Joseph's Well" },
          { source_type: "offer_page", title: "Joseph's Well – Blockbuster Offer From Top Diamond Vendor Book (printed)" },
        ],
      ),
    ).toMatch(/^Joseph'?s Well/);

    expect(
      resolveExportProductName(
        { name: "Digistore24", platformProductId: "47238" },
        [
          { source_type: "sales_page", title: "Compliance Guidelines (Read Before Launch)" },
          { source_type: "offer_page", title: "Earn 60% Commission Promoting CircO2 Nitric Oxide Booster Supplements - health" },
        ],
      ),
    ).toBe("CircO2 Nitric Oxide Booster Supplements");

    expect(
      resolveExportProductName(
        { name: "Digistore24 Product 51603", platformProductId: "51603" },
        [
          { source_type: "sales_page", title: "Coda | Page not found - Coda" },
          { source_type: "offer_page", title: "Advanced Memory Formula Supplements - health" },
        ],
      ),
    ).toBe("Advanced Memory Formula Supplements");
  });

  it("parses refund/cancellation rate from listing body", () => {
    const detail = extractDigistore24Detail({
      title: "Alpha Lean Formula",
      body: "Vendor: Acme Labs\nCategory: Health\nRefund rate: 8%\nCart conversion: 4%",
    });
    expect(detail.refundRate).toBe(8);
    expect(detail.conversionRate).toBe(4);
    expect(detail.detectedMeta.detected_refund_rate).toBe(8);
  });

  it("sanitizes buyer prices and rejects affiliate copy", () => {
    expect(sanitizeBuyerPrice("$67.00")).toBe("$67.00");
    expect(sanitizeBuyerPrice("Varies")).toBe("Varies");
    expect(
      sanitizeBuyerPrice("Joseph's Well Our Affiliates Are Seeing 5%+ Conversion Rates & Over $2 EPCs On ICE COLD Traffic!"),
    ).toBe("See official offer page");
    expect(sanitizeBuyerPrice("", 47)).toBe("$47.00");
  });

  it("extracts honest buyer prices from vendor materials", () => {
    expect(
      extractBuyerPriceFromVendorMaterials([
        {
          source_type: "order_page",
          content_text: "Normal price: $199 Temporarily only $67 USD Add to cart For limited time",
        },
        {
          source_type: "offer_page",
          content_text: "Price $75.91 Commission 35% EPC $19.28",
        },
      ]),
    ).toMatchObject({ display: "$67.00", cartValue: 67, reason: "only_price" });

    expect(
      extractBuyerPriceFromVendorMaterials([
        {
          source_type: "offer_page",
          content_text: "Price $50.99 Commission 75% EPC $26.75",
        },
      ]),
    ).toMatchObject({ display: "$50.99", cartValue: 50.99, reason: "marketplace_price_commission" });

    expect(
      extractBuyerPriceFromVendorMaterials([
        {
          source_type: "offer_page",
          content_text: "EPC $2.45 Commission 75%",
        },
      ]),
    ).toBeNull();
  });
});
