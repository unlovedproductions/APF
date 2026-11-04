import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  attachCompetitorBuyerPrices,
  evidencePriceComparison,
  finalizeBrief,
  sanitizeJobErrorMessage,
  sanitizeNarrativeString,
  serverEvidenceCoverage,
  shouldForceDegraded,
} from "../scripts/enrichment-brief-finalize.mjs";

describe("enrichment brief finalize", () => {
  const digistoreProduct = {
    id: 1,
    name: "Joseph's Well",
    platform: "digistore24",
    category: "Books",
    cartValue: 47,
  };

  it("ignores LLM evidence_coverage override for gate booleans", () => {
    const sources = [
      {
        url: "https://vendor.example/offer",
        source_type: "vendor",
        title: "Offer page",
        snippet: "Buy now",
      },
    ];
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "A printed book offer with refund terms on the official page.",
        positive_signals: ["Buyers like the format"],
        common_complaints: ["Shipping was slow"],
        common_claims: ["Helps with focus"],
        best_video_angles: ["Worth it or waste?"],
        confidence_score: 90,
        recommended_content_style: "worth_it_or_waste",
        evidence_coverage: {
          has_independent_review: true,
          has_vendor_material: true,
        },
      },
      sources,
      { hasVendorMaterial: true, reviewSources: [] },
    );

    expect(brief.evidence_coverage.has_independent_review).toBe(false);
    expect(brief.evidence_coverage.has_vendor_material).toBe(true);
    expect(brief.confidence_score).toBeLessThanOrEqual(55);
    expect(brief.positive_signals).toEqual([]);
    expect(brief.common_complaints).toEqual([]);
    expect(brief.coupon_code).toBe("");
  });

  it("strips affiliate chrome from review_summary", () => {
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Skip to content Digistore24 Promote Advanced Bionutritionals Supplements Now!",
        positive_signals: [],
        common_complaints: ["65% commission on Initial Sale 2 Amazing Upsells with 60% commission"],
        common_claims: ["Supports energy"],
        best_video_angles: ["What to verify before buying"],
        confidence_score: 55,
      },
      [],
      { hasVendorMaterial: true, reviewSources: [] },
    );

    expect(brief.review_summary.toLowerCase()).not.toMatch(/skip to content|commission/);
    expect(brief.common_complaints).toEqual([]);
  });

  it("replaces vendor sales-copy summaries when independent reviews are missing", () => {
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary:
          "They are self-sufficient, and they've had decades to perfect the methods they will share with you inside their new book.",
        positive_signals: ["Great book"],
        common_complaints: ["During the troubleshooting section, you'll learn how to sew"],
        best_video_angles: ["Worth it?"],
        confidence_score: 70,
      },
      [],
      { hasVendorMaterial: true, reviewSources: [] },
    );

    expect(brief.review_summary).toMatch(/limited independent/i);
    expect(brief.positive_signals).toEqual([]);
    expect(brief.common_complaints).toEqual([]);
  });

  it("caps confidence and forces degrade when search is suspended", () => {
    const coverage = serverEvidenceCoverage([], { hasVendorMaterial: true, resolvedProductName: "CircO2" });
    expect(shouldForceDegraded({ searchSuspended: true, hasVendorMaterial: true }, coverage)).toBe(true);

    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Independent coverage is thin for this offer.",
        best_video_angles: ["What to verify"],
        confidence_score: 80,
      },
      [],
      { hasVendorMaterial: true, reviewSources: [], searchSuspended: true },
    );
    expect(brief.confidence_score).toBeLessThanOrEqual(40);
  });

  it("forces degrade when independent reviewSources are empty", () => {
    const coverage = serverEvidenceCoverage(
      [{ url: "https://vendor.example/x", source_type: "vendor" }],
      { hasVendorMaterial: true, resolvedProductName: "Genius Wave" },
    );
    expect(
      shouldForceDegraded(
        { reviewSources: [], hasVendorMaterial: true },
        coverage,
      ),
    ).toBe(true);
    expect(
      shouldForceDegraded(
        {
          reviewSources: [{
            url: "https://www.trustpilot.com/review/x",
            snippet: "Customers report mixed shipping times after purchase.",
            raw_json: { content_text: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
          }],
          hasVendorMaterial: true,
        },
        { has_independent_review: true, has_vendor_material: true },
      ),
    ).toBe(false);
  });

  it("sanitizes provider error bodies and secrets from job messages", () => {
    expect(
      sanitizeJobErrorMessage("Ollama failed 500: {\"error\":\"secret stack\"}"),
    ).not.toContain("secret stack");
    expect(
      sanitizeJobErrorMessage("Brave 401: Bearer sk-abcdefghijklmnopqrstuv"),
    ).toMatch(/redacted/i);
    expect(sanitizeJobErrorMessage("plain timeout").length).toBeLessThanOrEqual(500);
  });

  it("sanitizeNarrativeString drops affiliate meta", () => {
    expect(
      sanitizeNarrativeString(
        "In other words, your keywords cannot include the words GeniusWave",
        "fallback",
      ),
    ).toBe("fallback");
    expect(sanitizeNarrativeString("Buyers report better sleep.", "fallback")).toBe(
      "Buyers report better sleep.",
    );
  });

  it("replaces generic common_claims from vendor order-page ledger", () => {
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Limited independent public review evidence.",
        common_claims: ["Positioned as a Books product.", "Viewers should verify current price, details, claims, and refund terms."],
        positive_signals: ["Great book"],
        common_complaints: ["Shipping was slow"],
        best_video_angles: ["Worth it?"],
        confidence_score: 50,
      },
      [],
      {
        hasVendorMaterial: true,
        reviewSources: [],
        vendorMaterials: [
          {
            source_type: "order_page",
            source_url: "https://vendor.example/josephs-well/order",
            content_text: "This printed book includes homestead methods. 1 Book $47.00 USD. 90-day money-back guarantee.",
            structured_blocks: {
              benefits: ["Printed book includes homestead methods designed to help you grow food"],
              pricing: ["1 Book $47.00"],
              objections: ["90-day money-back guarantee"],
            },
          },
        ],
      },
    );
    expect(brief.positive_signals).toEqual([]);
    expect(brief.common_complaints).toEqual([]);
    expect(brief.claim_ledger.length).toBeGreaterThan(0);
    expect(brief.common_claims.some((line) => /47\.00|guarantee|homestead|grow food/i.test(line))).toBe(true);
    expect(brief.common_claims.every((line) => !/positioned as a/i.test(line))).toBe(true);
  });

  it("clears praises/complaints for probe-only empty-content review sources", () => {
    const probes = [
      {
        url: "https://www.scamadvisor.com/check-website/circ-o2",
        source_type: "web",
        title: "CircO2 on ScamAdviser",
        snippet: "",
        raw_json: { direct_probe: true },
      },
      {
        url: "https://www.trustpilot.com/review/circ-o2",
        source_type: "web",
        title: "CircO2 on Trustpilot",
        snippet: "",
        raw_json: { direct_probe: true, content_text: "" },
      },
    ];
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Users love CircO2 based on ScamAdviser.",
        positive_signals: ["CircO2 on Trustpilot", "Great reviews"],
        common_complaints: ["CircO2 on ScamAdviser", "Shipping delays"],
        best_video_angles: ["Worth it?"],
        confidence_score: 70,
      },
      probes,
      { hasVendorMaterial: true, reviewSources: probes },
    );
    expect(brief.positive_signals).toEqual([]);
    expect(brief.common_complaints).toEqual([]);
    expect(brief.review_summary).toMatch(/limited independent/i);
    expect(shouldForceDegraded({ reviewSources: probes, hasVendorMaterial: true }, brief.evidence_coverage)).toBe(true);
  });

  it("keeps praises when independent sources have real content_text", () => {
    const reviews = [
      {
        url: "https://www.trustpilot.com/review/example",
        source_type: "web",
        title: "Buyer reviews",
        snippet: "Customers report mixed shipping times and solid packaging quality overall.",
        raw_json: {
          content_text:
            "Customers report mixed shipping times and solid packaging quality overall after several orders. ".repeat(3),
        },
      },
    ];
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Independent buyers mention packaging quality and mixed shipping times.",
        positive_signals: ["Solid packaging quality"],
        common_complaints: ["Mixed shipping times"],
        best_video_angles: ["Worth it?"],
        confidence_score: 70,
      },
      reviews,
      { hasVendorMaterial: true, reviewSources: reviews },
    );
    expect(brief.positive_signals).toContain("Solid packaging quality");
    expect(brief.common_complaints).toContain("Mixed shipping times");
  });

  it("drops ungrounded praises/complaints that never appear in source text", () => {
    const reviews = [
      {
        url: "https://www.trustpilot.com/review/example",
        source_type: "web",
        title: "Joseph's Well book buyers",
        snippet: "Printed book shipping was slow for some buyers.",
        raw_json: {
          content_text:
            "Joseph's Well printed book buyers mention slow shipping and unclear print quality. ".repeat(3),
        },
      },
    ];
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Joseph's Well is an atmospheric water generator.",
        positive_signals: ["Creates clean drinking water from air", "Printed book shipping was slow for some buyers"],
        common_complaints: ["Device pulls moisture unreliably", "unclear print quality"],
        best_video_angles: ["Worth it?"],
        confidence_score: 70,
      },
      reviews,
      { hasVendorMaterial: true, reviewSources: reviews },
    );
    expect(brief.positive_signals).not.toContain("Creates clean drinking water from air");
    expect(brief.common_complaints).not.toContain("Device pulls moisture unreliably");
    expect(brief.common_complaints.some((c) => /print quality/i.test(c))).toBe(true);
    expect(brief.confidence_score).toBeLessThanOrEqual(70);
  });

  it("caps confidence at 40 when thin independent evidence blocks praises", () => {
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Sounds great from the offer page.",
        positive_signals: ["Amazing"],
        common_complaints: ["Bad"],
        best_video_angles: ["Worth it?"],
        confidence_score: 70,
      },
      [],
      { hasVendorMaterial: true, reviewSources: [] },
    );
    expect(brief.positive_signals).toEqual([]);
    expect(brief.confidence_score).toBeLessThanOrEqual(40);
  });

  it("reconciles stale $67 brief price to cartValue", () => {
    const brief = finalizeBrief(
      { ...digistoreProduct, name: "The Genius Wave", cartValue: 49.86 },
      {
        review_summary: "Limited independent public review evidence.",
        positive_signals: [],
        common_complaints: [],
        best_video_angles: ["Worth it?"],
        confidence_score: 40,
        price_display: "$67",
        price_comparison: "The Genius Wave is $67 versus RivalX $39.",
      },
      [],
      {
        hasVendorMaterial: true,
        reviewSources: [],
        competitorCandidates: [{ name: "RivalX", price_display: "$39" }],
      },
    );
    expect(brief.price_display).toBe("$49.86");
    expect(brief.price_comparison).toContain("$49.86");
    expect(brief.price_comparison).not.toMatch(/\$67/);
  });

  it("Digistore fixture: strips commission/EPC from positive_signals even with review text", () => {
    const reviews = [
      {
        url: "https://www.reddit.com/r/x/comments/abc/title/",
        source_type: "web",
        title: "Buyer thread",
        snippet: "Customers report mixed shipping times.",
        raw_json: {
          content_text:
            "Customers report mixed shipping times and refund friction after two weeks. Solid packaging quality noted by buyers. ".repeat(2),
        },
      },
    ];
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Affiliates are seeing 5%+ conversion and $2 EPCs on cold traffic.",
        positive_signals: [
          "65% commission on Initial Sale",
          "Affiliates are seeing strong EPC",
          "Solid packaging quality",
        ],
        common_complaints: [
          "2 Amazing Upsells with 60% commission",
          "refund friction after two weeks",
        ],
        best_video_angles: ["Worth it?"],
        confidence_score: 70,
      },
      reviews,
      { hasVendorMaterial: true, reviewSources: reviews },
    );
    expect(brief.positive_signals.every((s) => !/commission|\bepc\b/i.test(s))).toBe(true);
    expect(brief.common_complaints.every((s) => !/commission|\bepc\b/i.test(s))).toBe(true);
    expect(brief.positive_signals).toContain("Solid packaging quality");
    expect(brief.review_summary.toLowerCase()).not.toMatch(/\bepc\b|commission/);
  });

  it("Digistore prompt bans commission/EPC language in narrative fields", () => {
    const prompt = fs.readFileSync(
      new URL("../docs/prompts/enrichment-digistore24.txt", import.meta.url),
      "utf8",
    );
    expect(prompt).toMatch(/ban affiliate|commission\/EPC|Avoid affiliate-marketer language/i);
    expect(prompt).toMatch(/positive_signals and common_complaints must come from independent review/);
    expect(prompt).toMatch(/Never invent brand names/);
  });

  it("restores default video angles when scrub removes every LLM angle", () => {
    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Limited independent public reviews; verify the offer page.",
        best_video_angles: [
          "Earn commission promoting this offer now",
          "They've had decades to perfect the methods they will share with you inside their new book.",
        ],
        confidence_score: 40,
      },
      [],
      { hasVendorMaterial: true, reviewSources: [] },
    );
    expect(brief.best_video_angles.length).toBeGreaterThan(0);
    expect(brief.best_video_angles.every((a) => !/commission/i.test(a))).toBe(true);
  });

  it("attaches competitor buyer prices from hit text and prefers evidence price_comparison", () => {
    const priced = attachCompetitorBuyerPrices(
      [{ name: "CircO2", source_url: "https://example.com/vs" }],
      [{
        url: "https://example.com/vs",
        title: "Joseph's Well vs CircO2",
        snippet: "CircO2 sells for $49.95 while Joseph's Well is $83.",
      }],
    );
    expect(priced[0].price_display).toBe("$49.95");
    expect(evidencePriceComparison(digistoreProduct, priced, "$83.45")).toContain("CircO2 $49.95");

    const brief = finalizeBrief(
      digistoreProduct,
      {
        review_summary: "Limited independent public reviews; verify the offer page.",
        best_video_angles: ["Worth it?"],
        price_comparison: "Invented rival is $9 forever",
        confidence_score: 40,
      },
      [],
      { hasVendorMaterial: true, reviewSources: [], competitorCandidates: priced },
    );
    expect(brief.price_comparison).toContain("CircO2 $49.95");
    expect(brief.price_comparison).not.toMatch(/Invented rival/);
  });
});
