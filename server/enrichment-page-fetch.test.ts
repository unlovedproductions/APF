import { describe, expect, it } from "vitest";
import {
  extractMainText,
  isHighTrustFetchCandidate,
  youtubeVideoId,
} from "../scripts/enrichment-page-fetch.mjs";

describe("enrichment page fetch", () => {
  it("extracts main content and removes page chrome", () => {
    const text = extractMainText(`
      <html>
        <body>
          <nav>Navigation noise</nav>
          <main><h1>Honest review</h1><p>Customers report useful detail.</p></main>
          <script>tracking()</script>
        </body>
      </html>
    `);

    expect(text).toContain("Honest review Customers report useful detail.");
    expect(text).not.toContain("Navigation noise");
    expect(text).not.toContain("tracking");
  });

  it("selects independent high-trust and vendor pages", () => {
    expect(isHighTrustFetchCandidate({
      url: "https://www.trustpilot.com/review/example.com",
    })).toBe(true);
    expect(isHighTrustFetchCandidate({
      url: "https://random-affiliate.example/review",
    })).toBe(false);
    expect(isHighTrustFetchCandidate(
      { url: "https://official.example/product" },
      new Set(["official.example"]),
    )).toBe(true);
  });

  it("parses common YouTube URL forms", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(youtubeVideoId("https://youtu.be/xyz789")).toBe("xyz789");
    expect(youtubeVideoId("https://www.youtube.com/shorts/short1")).toBe("short1");
    expect(youtubeVideoId("https://example.com/video")).toBe("");
  });
});
