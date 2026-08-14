import { describe, expect, it } from "vitest";
import {
  shouldPrune,
  shouldRetain,
} from "../scripts/prune-thin-review-sources.mjs";

describe("prune-thin-review-sources", () => {
  const aged = { discovered_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() };
  const young = { discovered_at: new Date().toISOString() };

  it("retains competitor context and high-trust retryable hosts", () => {
    expect(shouldRetain(
      { source_type: "competitor" },
      { content_text: "" },
      "web",
    )).toEqual({ retain: true, reason: "competitor_context" });

    expect(shouldRetain(
      { source_type: "web" },
      { competitor_search: true, content_text: "" },
      "web",
    ).retain).toBe(true);

    expect(shouldRetain(
      { source_type: "web" },
      { content_text: "" },
      "review",
    )).toEqual({ retain: true, reason: "high_trust_retryable" });
  });

  it("prunes aged thin web orphans and permanent fetch errors", () => {
    expect(shouldPrune(
      aged,
      { content_text: "short" },
      "web",
      14,
    )).toMatchObject({ prune: true, reason: "thin_web_orphan" });

    expect(shouldPrune(
      young,
      { content_text: "", fetch_error: "HTTP 404 Not Found" },
      "web",
      14,
    )).toMatchObject({ prune: true, reason: "permanent_fetch_error" });
  });

  it("holds young thin web rows and already-rich rows", () => {
    expect(shouldPrune(
      young,
      { content_text: "x".repeat(20) },
      "web",
      14,
    )).toMatchObject({ prune: false, reason: "too_young" });

    expect(shouldPrune(
      aged,
      { content_text: "x".repeat(80) },
      "web",
      14,
    )).toMatchObject({ prune: false, reason: "rich" });

    expect(shouldPrune(
      aged,
      { content_text: "", pruned_at: "2026-08-01T00:00:00.000Z" },
      "web",
      14,
    )).toMatchObject({ prune: false, reason: "already_pruned" });
  });

  it("does not prune high-trust thin hosts unless permanently dead", () => {
    expect(shouldPrune(
      aged,
      { content_text: "" },
      "review",
      14,
    )).toMatchObject({ prune: false, reason: "high_trust_retryable" });

    expect(shouldPrune(
      aged,
      { content_text: "", fetch_error: "HTTP 410 Gone" },
      "review",
      14,
    )).toMatchObject({ prune: true, reason: "permanent_fetch_error" });
  });
});
