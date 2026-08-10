import { describe, expect, it } from "vitest";
import { applyClaimLedgerToExport } from "../scripts/shadowcast-direct-lib.mjs";

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
