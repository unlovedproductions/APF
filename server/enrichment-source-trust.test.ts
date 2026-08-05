import { describe, expect, it } from "vitest";
import {
  classifySourceHost,
  competitorEvidenceQueries,
  digistoreEvidenceQueries,
  directReviewSiteCandidates,
  evidenceCoverageFromSources,
  extractCompetitorCandidatesFromHits,
  extractCompetitorNamesFromText,
  isProbeTitleSignal,
  isVendorSalesCopy,
  normalizeSuggestedCompetitors,
  looksPhysicalRetailCategory,
  shortSearchProductName,
  slugifyForReviewUrl,
  sourceHasUsableReviewText,
  substantiveReviewSources,
} from "../scripts/enrichment-source-trust.mjs";

describe("enrichment source trust", () => {
  it("classifies digistore24-app as affiliate noise", () => {
    expect(classifySourceHost("www.digistore24-app.com").tier).toBe("affiliate_noise");
    expect(classifySourceHost("digistore24-app.com").trust_boost).toBeLessThanOrEqual(-30);
  });

  it("classifies expanded affiliate network hosts as noise", () => {
    expect(classifySourceHost("hop.clickbank.net").tier).toBe("affiliate_noise");
    expect(classifySourceHost("jvzoo.com").tier).toBe("affiliate_noise");
    expect(classifySourceHost("warriorplus.com").tier).toBe("affiliate_noise");
    expect(classifySourceHost("buygoods.com").tier).toBe("affiliate_noise");
  });

  it("detects vendor sales copy for narrative scrubbing", () => {
    expect(
      isVendorSalesCopy(
        "They've had decades to perfect the methods they will share with you inside their new book.",
      ),
    ).toBe(true);
    expect(
      isVendorSalesCopy("Buyers report mixed results and want clearer refund terms."),
    ).toBe(false);
  });

  it("shortens marketing titles for search queries", () => {
    expect(
      shortSearchProductName(
        "Joseph's Well – Blockbuster Offer From Top Diamond Vendor Book (printed)",
      ),
    ).toBe("Joseph's Well");
    expect(
      shortSearchProductName("Primal Grow Pro - Top Male Enhancement Solution Supplements"),
    ).toBe("Primal Grow Pro");
    expect(shortSearchProductName("CircO2 Nitric Oxide Booster Supplements")).toBe(
      "CircO2 Nitric Oxide Booster Supplements",
    );
  });

  it("builds digistore queries from resolved product name, not marketplace brand", () => {
    const queries = digistoreEvidenceQueries({
      name: "Joseph's Well",
      category: "Health",
      vendor: "Acme",
    });
    expect(queries.some((q) => q.includes('"Joseph\'s Well" review'))).toBe(true);
    expect(queries.every((q) => !/"Digistore24"/.test(q))).toBe(true);
    expect(queries.some((q) => q.includes("site:amazon.com"))).toBe(false);
    expect(queries.length).toBeLessThanOrEqual(12);
    // Open-web queries first — site: filters burn Brave scrape budget faster.
    expect(queries[0]).toContain("review");
    expect(queries[0].startsWith("site:")).toBe(false);
  });

  it("builds direct review-site URL probes from product/vendor slugs", () => {
    const probes = directReviewSiteCandidates({
      name: "Joseph's Well",
      vendor: "Acme Labs",
    });
    expect(probes.length).toBeGreaterThan(0);
    expect(probes.length).toBeLessThanOrEqual(8);
    expect(probes.every((p) => p.raw_json?.direct_probe === true)).toBe(true);
    expect(probes.some((p) => /trustpilot\.com/.test(p.url))).toBe(true);
    expect(probes.some((p) => /sitejabber\.com/.test(p.url))).toBe(true);
    expect(probes.some((p) => /reddit\.com/.test(p.url))).toBe(true);
    expect(slugifyForReviewUrl("Joseph's Well")).toBe("josephs-well");

    const digistoreProbes = directReviewSiteCandidates(
      { name: "Joseph's Well", vendor: "Acme Labs" },
      { max: 12 },
    );
    expect(digistoreProbes.length).toBeGreaterThanOrEqual(probes.length);
    expect(digistoreProbes.length).toBeLessThanOrEqual(12);
  });

  it("caps digistore and competitor query counts", () => {
    const evidence = digistoreEvidenceQueries(
      { name: "CircO2", category: "Nitric Oxide Supplements", vendor: "vendor.example" },
      { maxProduct: 8, maxVendor: 4 },
    );
    expect(evidence.length).toBeLessThanOrEqual(12);
    expect(evidence.filter((q) => q.includes("vendor.example")).length).toBeLessThanOrEqual(4);

    const competitors = competitorEvidenceQueries({ name: "CircO2", category: "Health" }, { max: 2 });
    expect(competitors).toEqual(['"CircO2" vs', '"CircO2" alternative']);
  });

  it("includes retail site queries only for physical/retail categories", () => {
    expect(looksPhysicalRetailCategory("Nitric Oxide Supplements")).toBe(true);
    const queries = digistoreEvidenceQueries(
      {
        name: "CircO2",
        category: "Nitric Oxide Supplements",
      },
      { maxProduct: 16, maxVendor: 0 },
    );
    expect(queries.some((q) => q.includes("site:amazon.com"))).toBe(true);
  });

  it("builds competitor evidence queries", () => {
    const queries = competitorEvidenceQueries({ name: "CircO2", category: "Health" });
    expect(queries[0]).toContain('"CircO2" vs');
    expect(queries.some((q) => q.includes("alternative"))).toBe(true);
  });

  it("normalizeSuggestedCompetitors returns empty instead of synthetic placeholders", () => {
    expect(normalizeSuggestedCompetitors({ name: "CircO2", vendor: "Acme" }, [])).toEqual([]);
    expect(
      normalizeSuggestedCompetitors(
        { name: "CircO2", category: "Health" },
        ["Top Health alternative", "Popular Health competitor", "Budget Health option"],
      ),
    ).toEqual([]);
  });

  it("keeps only allowed competitor candidates when provided", () => {
    expect(
      normalizeSuggestedCompetitors(
        { name: "CircO2", vendor: "Acme" },
        ["NitroMax", "InventedBrand"],
        [{ name: "NitroMax" }],
      ),
    ).toEqual(["NitroMax"]);
  });

  it("extracts competitor names from vs titles", () => {
    expect(
      extractCompetitorNamesFromText("CircO2 vs NitroMax: which nitric oxide booster?", { name: "CircO2" }),
    ).toContain("NitroMax");
  });

  it("extracts candidates from search hits", () => {
    const candidates = extractCompetitorCandidatesFromHits(
      [
        {
          title: "Joseph's Well vs PureWell Review",
          snippet: "Comparing Joseph's Well or PureWell for buyers",
          url: "https://example.com/vs",
        },
      ],
      { name: "Joseph's Well", vendor: "Book Vendor" },
    );
    expect(candidates.some((c) => /PureWell/i.test(c.name))).toBe(true);
  });

  it("extends evidence coverage with independent review flags", () => {
    const coverage = evidenceCoverageFromSources(
      [
        {
          url: "https://www.trustpilot.com/review/example",
          source_type: "review",
        },
      ],
      { resolved_product_name: "Joseph's Well", has_vendor_material: true },
    );
    expect(coverage.has_independent_review).toBe(true);
    expect(coverage.has_vendor_material).toBe(true);
    expect(coverage.resolved_product_name).toBe("Joseph's Well");
  });

  it("sourceHasUsableReviewText rejects empty direct probes", () => {
    expect(isProbeTitleSignal("CircO2 on ScamAdviser")).toBe(true);
    expect(sourceHasUsableReviewText({
      title: "CircO2 on ScamAdviser",
      snippet: "",
      raw_json: { direct_probe: true },
    })).toBe(false);
    expect(sourceHasUsableReviewText({
      title: "Buyer thread",
      snippet: "Customers report refund friction after two weeks of use.",
      raw_json: {},
    })).toBe(true);
    expect(substantiveReviewSources([
      { title: "X on Trustpilot", raw_json: { direct_probe: true } },
      { snippet: "Customers report refund friction after two weeks of use.", raw_json: {} },
    ])).toHaveLength(1);
  });
});
