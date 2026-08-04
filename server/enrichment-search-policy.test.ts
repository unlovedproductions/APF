import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifySourceHost } from "../scripts/enrichment-source-trust.mjs";
import {
  buildSearxngSearchUrl,
  hasEnoughReviewEvidence,
  isSearchCooldownActive,
  isSearchHttpRateLimitStatus,
  isSearchRateLimitSignal,
  listSearchEngineAttempts,
  readSearchCooldown,
  shouldOpenSearchCircuit,
  writeSearchCooldown,
} from "../scripts/enrichment-search-policy.mjs";

describe("enrichment search policy", () => {
  it("pins SearXNG URL to brave by default", () => {
    const url = buildSearxngSearchUrl("http://localhost:8088", 'site:trustpilot.com "Joseph\'s Well"');
    expect(url.searchParams.get("engines")).toBe("brave");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("q")).toContain("trustpilot.com");
  });

  it("allows custom engine list", () => {
    const url = buildSearxngSearchUrl("http://localhost:8088", "test", "brave,wikipedia");
    expect(url.searchParams.get("engines")).toBe("brave,wikipedia");
  });

  it("orders primary then fallback engines without duplicates", () => {
    expect(listSearchEngineAttempts("brave", "duckduckgo")).toEqual(["brave", "duckduckgo"]);
    expect(listSearchEngineAttempts("brave,duckduckgo", "duckduckgo,bing")).toEqual([
      "brave",
      "duckduckgo",
      "bing",
    ]);
    expect(listSearchEngineAttempts("", "")).toEqual(["brave"]);
  });

  it("treats HTTP 429 and 403 as rate-limit statuses", () => {
    expect(isSearchHttpRateLimitStatus(429)).toBe(true);
    expect(isSearchHttpRateLimitStatus(403)).toBe(true);
    expect(isSearchHttpRateLimitStatus(500)).toBe(false);
  });

  it("detects rate-limit signatures in unresponsive_engines", () => {
    expect(isSearchRateLimitSignal([["duckduckgo", "CAPTCHA"]])).toBe(true);
    expect(isSearchRateLimitSignal([["brave", "Too many requests"]])).toBe(true);
    expect(isSearchRateLimitSignal([["bing", "timeout"]])).toBe(false);
    expect(isSearchRateLimitSignal([])).toBe(false);
  });

  it("does not open circuit on soft miss with generic timeouts", () => {
    expect(
      shouldOpenSearchCircuit({
        results: [],
        unresponsive: [["bing", "timeout"], ["yahoo", "HTTP error"]],
      }),
    ).toBe(false);
  });

  it("does not open circuit when hits exist even if engines fail", () => {
    expect(
      shouldOpenSearchCircuit({
        results: [{ url: "https://example.com" }],
        unresponsive: [["duckduckgo", "CAPTCHA"]],
      }),
    ).toBe(false);
  });

  it("opens circuit only on rate-limit with zero hits", () => {
    expect(
      shouldOpenSearchCircuit({
        results: [],
        unresponsive: [["brave", "Too many request"]],
      }),
    ).toBe(true);
  });

  it("counts enough distinct review-tier hosts for early-stop", () => {
    const sources = [
      { url: "https://www.trustpilot.com/review/acme" },
      { url: "https://www.reddit.com/r/scams/comments/1" },
      { url: "https://www.youtube.com/watch?v=abc" },
      { url: "https://vendor.example/sales" },
    ];
    expect(hasEnoughReviewEvidence(sources, classifySourceHost, 3)).toBe(true);
    expect(hasEnoughReviewEvidence(sources.slice(0, 2), classifySourceHost, 3)).toBe(false);
  });

  it("ignores direct probes when excludeDirectProbes is set", () => {
    const probes = [
      { url: "https://www.trustpilot.com/review/a", raw_json: { direct_probe: true } },
      { url: "https://www.reddit.com/r/x", raw_json: { direct_probe: true } },
      { url: "https://www.youtube.com/watch?v=1", raw_json: { direct_probe: true } },
    ];
    expect(hasEnoughReviewEvidence(probes, classifySourceHost, 3, { excludeDirectProbes: true })).toBe(false);
    expect(
      hasEnoughReviewEvidence(
        [...probes, { url: "https://www.trustpilot.com/review/real" }, { url: "https://www.reddit.com/r/real" }, { url: "https://www.sitejabber.com/reviews/real" }],
        classifySourceHost,
        3,
        { excludeDirectProbes: true },
      ),
    ).toBe(true);
  });

  it("persists and reads cross-job search cooldown", () => {
    const filePath = path.join(os.tmpdir(), `apf-search-cooldown-${Date.now()}.json`);
    const untilMs = Date.now() + 15 * 60 * 1000;
    writeSearchCooldown(filePath, { untilMs, reason: "rate_limited" });
    const state = readSearchCooldown(filePath);
    expect(isSearchCooldownActive(state)).toBe(true);
    expect(state?.reason).toBe("rate_limited");
    expect(readSearchCooldown(filePath, untilMs + 1)).toBe(null);
    fs.unlinkSync(filePath);
  });
});
