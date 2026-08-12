import { afterEach, describe, expect, it } from "vitest";
import {
  canFirecrawlScrape,
  canFirecrawlSearch,
  extractFirecrawlMarkdown,
  getFirecrawlBudget,
  isFirecrawlConfigured,
  isFirecrawlSelfHosted,
  mapFirecrawlSearchResults,
  resetFirecrawlBudget,
  resolveFirecrawlBaseUrl,
} from "../scripts/enrichment-firecrawl.mjs";

describe("enrichment firecrawl", () => {
  afterEach(() => {
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_BASE_URL;
    resetFirecrawlBudget({ maxSearch: 2, maxScrape: 3 });
  });

  it("detects cloud key or self-hosted base URL", () => {
    expect(isFirecrawlConfigured({ FIRECRAWL_API_KEY: "" })).toBe(false);
    expect(isFirecrawlConfigured({ FIRECRAWL_API_KEY: "fc-test" })).toBe(true);
    expect(isFirecrawlConfigured({ FIRECRAWL_BASE_URL: "http://localhost:3002/v2" })).toBe(true);
  });

  it("resolves base URL and self-host detection", () => {
    expect(resolveFirecrawlBaseUrl({})).toBe("https://api.firecrawl.dev/v2");
    expect(resolveFirecrawlBaseUrl({ FIRECRAWL_BASE_URL: "http://localhost:3002" }))
      .toBe("http://localhost:3002/v2");
    expect(resolveFirecrawlBaseUrl({ FIRECRAWL_BASE_URL: "http://localhost:3002/v2/" }))
      .toBe("http://localhost:3002/v2");
    expect(isFirecrawlSelfHosted({ FIRECRAWL_BASE_URL: "http://localhost:3002/v2" })).toBe(true);
    expect(isFirecrawlSelfHosted({})).toBe(false);
  });

  it("maps array and web-shaped search payloads", () => {
    const fromArray = mapFirecrawlSearchResults({
      data: [
        {
          title: "Honest review",
          description: "Users say it works",
          url: "https://www.trustpilot.com/review/example.com",
        },
      ],
    });
    expect(fromArray).toHaveLength(1);
    expect(fromArray[0].source_name).toBe("trustpilot.com");
    expect(fromArray[0].raw_json.provider).toBe("firecrawl");

    const fromWeb = mapFirecrawlSearchResults({
      data: {
        web: [
          { title: "A", description: "B", url: "https://reddit.com/r/x" },
          { title: "C", description: "D", url: "https://youtube.com/watch?v=1" },
        ],
      },
    }, { limit: 1 });
    expect(fromWeb).toHaveLength(1);
    expect(fromWeb[0].url).toContain("reddit.com");
  });

  it("extracts markdown from scrape payload shapes", () => {
    expect(extractFirecrawlMarkdown({
      data: { markdown: "# Hello\n\nWorld review content here." },
    })).toContain("Hello");
    expect(extractFirecrawlMarkdown({
      data: [{ markdown: "plain text from array" }],
    })).toBe("plain text from array");
  });

  it("enforces per-job search and scrape budgets", () => {
    process.env.FIRECRAWL_BASE_URL = "http://localhost:3002/v2";
    resetFirecrawlBudget({ maxSearch: 1, maxScrape: 2 });
    expect(canFirecrawlSearch()).toBe(true);
    expect(canFirecrawlScrape()).toBe(true);

    const b0 = getFirecrawlBudget();
    expect(b0.maxSearch).toBe(1);
    expect(b0.maxScrape).toBe(2);

    resetFirecrawlBudget({ maxSearch: 0, maxScrape: 0 });
    expect(canFirecrawlSearch()).toBe(false);
    expect(canFirecrawlScrape()).toBe(false);
  });
});
