import { describe, expect, it } from "vitest";
import { coerceLlmBriefPayload, flattenBriefValue } from "../scripts/enrichment-brief-coerce.mjs";

describe("enrichment brief coerce", () => {
  it("flattens object string fields the LLM often returns", () => {
    expect(flattenBriefValue({ text: "Buyers comparing water kits" })).toBe(
      "Buyers comparing water kits",
    );
    expect(flattenBriefValue(["a", "b"])).toBe("a; b");
  });

  it("coerces who_it_may_help / target_audience objects into strings", () => {
    const coerced = coerceLlmBriefPayload({
      review_summary: "Summary",
      target_audience: { primary: "Homeowners", secondary: "Preppers" },
      who_it_may_help: { text: "People who want atmospheric water" },
      who_should_skip_it: ["Pros", "Anyone needing guarantees"],
      best_video_angles: [{ name: "Worth it?" }, "Pros and cons"],
      suggested_competitors: [{ name: "PureWell" }, "Invented"],
      confidence_score: "62",
      positive_signals: [],
    });

    expect(coerced.target_audience).toContain("Homeowners");
    expect(coerced.who_it_may_help).toBe("People who want atmospheric water");
    expect(coerced.who_should_skip_it).toBe("Pros; Anyone needing guarantees");
    expect(coerced.best_video_angles).toEqual(["Worth it?", "Pros and cons"]);
    expect(coerced.suggested_competitors).toEqual(["PureWell", "Invented"]);
    expect(coerced.confidence_score).toBe(62);
  });
});
