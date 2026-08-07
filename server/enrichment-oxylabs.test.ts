import { afterEach, describe, expect, it } from "vitest";
import {
  canOxylabsSearch,
  getOxylabsBudget,
  isOxylabsConfigured,
  mapOxylabsSearchResults,
  resetOxylabsBudget,
} from "../scripts/enrichment-oxylabs.mjs";

describe("enrichment oxylabs", () => {
  afterEach(() => {
    delete process.env.OXYLABS_USERNAME;
    delete process.env.OXYLABS_PASSWORD;
    resetOxylabsBudget({ maxSearch: 2, minGapMs: 110 });
  });

  it("requires both username and password", () => {
    expect(isOxylabsConfigured({})).toBe(false);
    expect(isOxylabsConfigured({ OXYLABS_USERNAME: "u" })).toBe(false);
    expect(isOxylabsConfigured({ OXYLABS_USERNAME: "u", OXYLABS_PASSWORD: "p" })).toBe(true);
  });

  it("maps parsed google_search organic results", () => {
    const mapped = mapOxylabsSearchResults({
      results: [
        {
          content: {
            results: {
              organic: [
                {
                  pos: 1,
                  url: "https://www.trustpilot.com/review/example.com",
                  title: "Example Reviews",
                  desc: "Customers say it works",
                },
                {
                  pos: 2,
                  url: "https://www.reddit.com/r/scams/comments/1",
                  title: "Reddit thread",
                  desc: "Discussion",
                },
              ],
            },
          },
        },
      ],
    }, { limit: 1 });

    expect(mapped).toHaveLength(1);
    expect(mapped[0].source_name).toBe("trustpilot.com");
    expect(mapped[0].snippet).toContain("works");
    expect(mapped[0].raw_json.provider).toBe("oxylabs");
  });

  it("enforces per-job search budget", () => {
    process.env.OXYLABS_USERNAME = "u";
    process.env.OXYLABS_PASSWORD = "p";
    resetOxylabsBudget({ maxSearch: 1 });
    expect(canOxylabsSearch()).toBe(true);
    expect(getOxylabsBudget().maxSearch).toBe(1);

    resetOxylabsBudget({ maxSearch: 0 });
    expect(canOxylabsSearch()).toBe(false);
  });
});
