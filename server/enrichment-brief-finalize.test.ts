import { describe, expect, it } from "vitest";
import {
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
          reviewSources: [{ url: "https://www.trustpilot.com/review/x" }],
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
});
