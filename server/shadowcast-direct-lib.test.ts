import { describe, expect, it } from "vitest";
import {
  applyClaimLedgerToExport,
  resolveShadowCastFormIdentity,
} from "../scripts/shadowcast-direct-lib.mjs";

describe("resolveShadowCastFormIdentity", () => {
  it("maps Digistore marketplace name + EPC brief price to real name and cart buyer price", () => {
    const identity = resolveShadowCastFormIdentity({
      platform: "digistore24",
      product: {
        name: "Digistore24",
        platformProductId: "12345",
        cartValue: 79.95,
      },
      reviewBrief: {
        price_display: "Affiliates Are Seeing 5%+ Conversion Rates & Over $2 EPCs",
      },
      vendorMaterials: [
        {
          source_type: "order_page",
          title: "Earn 50% commission promoting Joseph's Well",
          excerpt: "1 Bottle $79.95 USD",
        },
      ],
    });

    expect(identity.isDigistore).toBe(true);
    expect(identity.product_name).toMatch(/Joseph'?s Well/i);
    expect(identity.price).toBe("$79.95");
  });

  it("quarantines Digistore EPC price when cartValue is missing", () => {
    const identity = resolveShadowCastFormIdentity({
      platform: "digistore24",
      product: { name: "Digistore24" },
      reviewBrief: {
        price_display: "Over $2 EPCs on ice cold traffic",
      },
      vendorMaterials: [],
    });

    expect(identity.price).toBe("See official offer page");
  });

  it("keeps Digistore buyer price when brief price is clean", () => {
    const identity = resolveShadowCastFormIdentity({
      platform: "digistore24",
      product: { name: "CircO2", cartValue: 47 },
      reviewBrief: { price_display: "$47.00" },
      vendorMaterials: [],
    });

    expect(identity.product_name).toBe("CircO2");
    expect(identity.price).toBe("$47.00");
  });

  it("falls back to cartValue for non-Digistore when brief price is missing", () => {
    const identity = resolveShadowCastFormIdentity({
      platform: "clickbank",
      product: { name: "SomeOffer", cartValue: 37 },
      reviewBrief: null,
    });

    expect(identity.isDigistore).toBe(false);
    expect(identity.product_name).toBe("SomeOffer");
    expect(identity.price).toBe("$37.00");
  });
});

describe("applyClaimLedgerToExport", () => {
  it("builds claim_ledger at send time when brief column is stale", () => {
    const { claim_ledger, common_claims } = applyClaimLedgerToExport(
      {
        common_claims: ["Positioned as a Health product."],
        claim_ledger: [],
      },
      [
        {
          source_type: "order_page",
          url: "https://www.advancedbionutritionals.com/DS24/Advanced-Mitochondrial/order.htm",
          excerpt: "Supports cellular energy with Niacinamide NAD. 1 Bottle $79.95 USD. 90-day money-back guarantee.",
          structured_blocks: {
            benefits: ["Supports cellular energy with Niacinamide NAD"],
            pricing: ["1 Bottle $79.95"],
            objections: ["90-day money-back guarantee"],
          },
        },
      ],
      [],
    );

    expect(claim_ledger.length).toBeGreaterThanOrEqual(3);
    expect(common_claims.every((line) => !/positioned as a/i.test(line))).toBe(true);
    expect(claim_ledger.every((row) => row.source_url && row.kind)).toBe(true);
  });
});
