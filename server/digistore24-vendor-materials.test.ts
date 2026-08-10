import { describe, expect, it } from "vitest";
import {
  extractClaimLedger,
  isGenericCommonClaim,
  seedCommonClaimsFromLedger,
} from "../scripts/digistore24-vendor-materials.mjs";

const MITO_ORDER_URL =
  "https://www.advancedbionutritionals.com/DS24/Advanced-Mitochondrial/Too-Tired-To-Enjoy-It/HD.htm";
const GARDEN_ORDER_URL = "https://www.vendor-garden.example/medicinal-garden-kit/order";

describe("extractClaimLedger", () => {
  it("extracts mitochondrial ingredients, price, and guarantee from order page", () => {
    const ledger = extractClaimLedger(
      [
        {
          source_type: "sales_page",
          title: "Compliance Guidelines (Read Before Launch)",
          url: "https://coda.io/d/compliance",
          excerpt: "https://cdn.coda.io/assets/x/img/import_google_docs.png Dashboard Marketplace Analytics",
        },
        {
          source_type: "offer_page",
          title: "Earn 60% Commission Promoting Advanced Mitochondrial Formula Supplements - health",
          url: "https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all/detail/50163",
          excerpt: "Price $187 Commission 60% EPC $19.28",
        },
        {
          source_type: "order_page",
          title: "This is Like Rocket Fuel for Your Mitochondria!",
          source_url: MITO_ORDER_URL,
          content_text: [
            "Advanced Mitochondrial Formula is designed to support cellular energy.",
            "Key ingredients include Niacinamide to raise NAD, CoQ10, PQQ, and D-Ribose.",
            "1 Bottle $79.95 USD. 6 Bottles $66.65 per bottle.",
            "Backed by a 90-day money-back guarantee.",
            "Dashboard Marketplace Analytics skip to content Digistore24",
          ].join(" "),
          structured_blocks: {
            benefits: ["Supports cellular energy with Niacinamide NAD support"],
            pricing: ["1 Bottle $79.95"],
            objections: ["90-day money-back guarantee if you are not satisfied"],
          },
        },
      ],
      [
        {
          url: "https://www.scamadviser.com/check-website/advancedbionutritionals",
          title: "Advanced Mitochondrial Formula on ScamAdviser",
          snippet: "",
          raw_json: { direct_probe: true, content_text: "" },
        },
      ],
    );

    expect(ledger.length).toBeGreaterThanOrEqual(5);
    expect(ledger.every((row) => row.source_url && row.text && row.kind)).toBe(true);
    expect(ledger.some((row) => row.kind === "ingredient" && /niacinamide|nad|coq10/i.test(row.text))).toBe(true);
    expect(ledger.some((row) => row.kind === "price" && /79\.95/.test(row.text))).toBe(true);
    expect(ledger.some((row) => row.kind === "guarantee" && /90-day/i.test(row.text))).toBe(true);
    expect(ledger.every((row) => row.source_url === MITO_ORDER_URL)).toBe(true);
    expect(ledger.some((row) => /coda|commission|epc|dashboard/i.test(row.text))).toBe(false);
  });

  it("extracts garden kit what's-in-the-box claims from order page", () => {
    const ledger = extractClaimLedger([
      {
        source_type: "order_page",
        title: "Medicinal Garden Kit",
        source_url: GARDEN_ORDER_URL,
        content_text:
          "The kit includes heirloom herb seeds chosen to grow your own medicinal garden at home. Designed to help you grow calendula, echinacea, and chamomile. One kit price is only $72.91 USD.",
        structured_blocks: {
          benefits: ["Kit includes heirloom herb seeds to grow your own medicinal garden"],
          pricing: ["Medicinal Garden Kit only $72.91"],
        },
      },
    ]);

    expect(ledger.some((row) => /seeds|grow your/i.test(row.text))).toBe(true);
    expect(ledger.some((row) => row.kind === "price" && /72\.91/.test(row.text))).toBe(true);
    expect(ledger.every((row) => row.source_url === GARDEN_ORDER_URL)).toBe(true);
  });

  it("keeps independent review lines only when content_text is substantive", () => {
    const ledger = extractClaimLedger(
      [],
      [
        {
          url: "https://www.trustpilot.com/review/example",
          source_type: "web",
          snippet: "CircO2 on Trustpilot",
          raw_json: {
            content_text:
              "I bought one box last month. Shipping took two weeks but the packaging quality was solid overall and I will reorder.",
          },
        },
      ],
    );
    expect(ledger.some((row) => row.kind === "independent_review")).toBe(true);
    expect(ledger[0].source_url).toContain("trustpilot.com");
  });
});

describe("seedCommonClaimsFromLedger", () => {
  it("replaces generic LLM slogans with ledger texts", () => {
    const ledger = extractClaimLedger([
      {
        source_type: "order_page",
        source_url: MITO_ORDER_URL,
        content_text: "Supports cellular energy. Niacinamide raises NAD. 90-day money-back guarantee. 1 Bottle $79.95 USD.",
        structured_blocks: {
          benefits: ["Supports cellular energy"],
          pricing: ["1 Bottle $79.95"],
          objections: ["90-day money-back guarantee"],
        },
      },
    ]);
    expect(isGenericCommonClaim("Positioned as a Health product.")).toBe(true);
    const seeded = seedCommonClaimsFromLedger(
      ["Positioned as a Health product.", "Viewers should verify current price, details, claims, and refund terms."],
      ledger,
    );
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every((line) => !isGenericCommonClaim(line))).toBe(true);
  });
});
