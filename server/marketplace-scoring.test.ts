import { describe, expect, it } from "vitest";
import {
  applyPromoteOutcomeCalibration,
  isCampaignPromoteResult,
  scoreDigistore24,
  summarizePromoteResults,
} from "../scripts/marketplace-scoring.mjs";
import {
  normalizePromoteCsvRow,
  parsePromoteCsv,
} from "../scripts/promote-outcomes.mjs";

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

  it("gates promote calibration until enough promote_result rows", () => {
    const baseScore = scoreDigistore24(base);
    const gated = scoreDigistore24({
      ...base,
      promoteOutcomes: [
        { event: "promote_result", net_epc: 2.5, refund_rate: 4 },
        { event: "promote_result", net_epc: 2.1, refund_rate: 3 },
      ],
    });
    expect(gated.meta.promote_calibration.applied).toBe(false);
    expect(gated.score).toBe(baseScore.score);

    const applied = applyPromoteOutcomeCalibration(baseScore, [
      { event: "promote_result", net_epc: 2.5, refund_rate: 4 },
      { event: "promote_result", net_epc: 2.1, refund_rate: 3 },
      { event: "promote_result", net_epc: 1.8, refund_rate: 5 },
    ]);
    expect(applied.meta.promote_calibration.applied).toBe(true);
    expect(applied.strategy).toContain("promote_cal");
  });

  it("excludes listing_signal seeds from campaign calibration counts", () => {
    expect(isCampaignPromoteResult({
      event: "promote_result",
      notes: "listing_signal: digistore marketplace EPC",
      net_epc: 2,
    })).toBe(false);
    const summary = summarizePromoteResults([
      { event: "promote_result", notes: "listing_signal: x", net_epc: 3 },
      { event: "promote_result", notes: "campaign: week 1", net_epc: 1.2, refund_rate: 5 },
      { event: "promote_result", notes: "campaign: week 2", net_epc: 1.0, refund_rate: 6 },
    ]);
    expect(summary.n).toBe(2);
    expect(summary.avg_epc).toBeCloseTo(1.1, 5);
  });
});

describe("promote CSV import helpers", () => {
  it("parses CSV and rejects listing_signal notes", () => {
    const rows = parsePromoteCsv(`product_id,epc,refund_rate,notes
1,1.25,8,campaign: week 1
2,0.9,4,campaign: week 1`);
    expect(rows).toHaveLength(2);
    expect(normalizePromoteCsvRow(rows[0]).productId).toBe(1);
    expect(normalizePromoteCsvRow(rows[0]).netEpc).toBe(1.25);
    expect(() => normalizePromoteCsvRow({
      product_id: "1",
      epc: "2",
      notes: "listing_signal: no",
    })).toThrow(/listing_signal/);
  });
});
