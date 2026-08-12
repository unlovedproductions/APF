import { afterEach, describe, expect, it } from "vitest";
import {
  canPlaywrightStealthFetch,
  getPlaywrightStealthBudget,
  isPlaywrightStealthEnabled,
  resetPlaywrightStealthBudget,
} from "../scripts/enrichment-playwright-stealth.mjs";

describe("enrichment playwright stealth", () => {
  afterEach(() => {
    delete process.env.REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH;
    delete process.env.REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH_MAX_PER_JOB;
    resetPlaywrightStealthBudget({ max: 3 });
  });

  it("respects REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH=0", () => {
    process.env.REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH = "0";
    expect(isPlaywrightStealthEnabled()).toBe(false);
    expect(canPlaywrightStealthFetch()).toBe(false);
  });

  it("enforces per-job budget when enabled", () => {
    process.env.REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH = "1";
    resetPlaywrightStealthBudget({ max: 2 });
    expect(getPlaywrightStealthBudget().max).toBe(2);
    // Deps are installed in this workspace — enabled should load.
    expect(isPlaywrightStealthEnabled()).toBe(true);
    expect(canPlaywrightStealthFetch()).toBe(true);

    resetPlaywrightStealthBudget({ max: 0 });
    expect(canPlaywrightStealthFetch()).toBe(false);
  });
});
