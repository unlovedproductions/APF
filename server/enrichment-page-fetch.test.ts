import { describe, expect, it } from "vitest";
import {
  assertSafeFetchUrl,
  buildJinaReaderUrl,
  createPinnedLookup,
  extractMainText,
  extractYouTubeCaptionTrackUrls,
  isBlockedFetchIp,
  isContentCacheFresh,
  isHighTrustFetchCandidate,
  isJinaReaderEnabled,
  isRedditUrl,
  loadUndici,
  redditJsonUrl,
  selectPageFetchCandidates,
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

  it("prefers review-body selectors over chrome", () => {
    const text = extractMainText(`
      <html><body>
        <aside class="ads">Buy now affiliate</aside>
        <div itemprop="reviewBody"><p>Real user complaint about shipping.</p></div>
      </body></html>
    `);
    expect(text).toContain("Real user complaint about shipping.");
    expect(text).not.toContain("Buy now affiliate");
  });

  it("blocks private and loopback fetch targets", async () => {
    expect(isBlockedFetchIp("127.0.0.1")).toBe(true);
    expect(isBlockedFetchIp("10.0.0.5")).toBe(true);
    expect(isBlockedFetchIp("192.168.1.10")).toBe(true);
    expect(isBlockedFetchIp("169.254.169.254")).toBe(true);
    expect(isBlockedFetchIp("168.63.129.16")).toBe(true);
    expect(isBlockedFetchIp("8.8.8.8")).toBe(false);

    await expect(assertSafeFetchUrl("http://127.0.0.1/")).rejects.toThrow(/blocked/i);
    await expect(assertSafeFetchUrl("http://192.168.0.1/x")).rejects.toThrow(/blocked/i);
    await expect(assertSafeFetchUrl("http://168.63.129.16/")).rejects.toThrow(/blocked/i);
    await expect(assertSafeFetchUrl("file:///etc/passwd")).rejects.toThrow(/unsupported protocol/i);
    await expect(assertSafeFetchUrl("http://localhost/")).rejects.toThrow(/blocked/i);
  });

  it("treats youtube as a high-trust fetch candidate", () => {
    expect(isHighTrustFetchCandidate({
      url: "https://www.youtube.com/watch?v=abc123",
    })).toBe(true);
  });

  it("expires content_text cache without fetched_at or when older than TTL", () => {
    expect(isContentCacheFresh({
      content_text: "x".repeat(100),
    })).toBe(false);

    expect(isContentCacheFresh({
      content_text: "x".repeat(100),
      fetched_at: new Date().toISOString(),
    }, { maxAgeDays: 14 })).toBe(true);

    expect(isContentCacheFresh({
      content_text: "x".repeat(100),
      fetched_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    }, { maxAgeDays: 14 })).toBe(false);
  });

  it("selects review tiers first and skips permanent fetch failures", () => {
    const { candidates, successLimit } = selectPageFetchCandidates([
      {
        url: "https://vendor.example/offer",
        relevance_score: 90,
        trust_score: 90,
        raw_json: {},
      },
      {
        url: "https://www.trustpilot.com/review/example",
        relevance_score: 50,
        trust_score: 50,
        raw_json: {},
      },
      {
        url: "https://www.scamadvisor.com/check-website/x",
        relevance_score: 40,
        trust_score: 40,
        raw_json: { fetch_error: "HTTP 404" },
      },
      {
        url: "https://www.amazon.com/dp/x",
        relevance_score: 80,
        trust_score: 80,
        raw_json: {},
      },
    ], {
      vendorDomains: new Set(["vendor.example"]),
      limit: 2,
      maxAttempts: 4,
    });

    expect(successLimit).toBe(2);
    expect(candidates[0].url).toContain("trustpilot.com");
    expect(candidates.some((c) => c.url.includes("scamadvisor.com"))).toBe(false);
    expect(candidates.length).toBeLessThanOrEqual(4);
  });

  it("fetches direct_probe URLs before generic web fillers", () => {
    const { candidates } = selectPageFetchCandidates([
      {
        url: "https://random-blog.example/post",
        relevance_score: 99,
        trust_score: 99,
        raw_json: {},
      },
      {
        url: "https://www.trustpilot.com/review/josephs-well",
        relevance_score: 10,
        trust_score: 10,
        raw_json: { direct_probe: true },
      },
    ], { limit: 2, maxAttempts: 4 });

    expect(candidates[0].url).toContain("trustpilot.com");
    expect(candidates[0].raw_json.direct_probe).toBe(true);
  });

  it("loads transitive undici and pins DNS lookup to validated IPs", () => {
    const undici = loadUndici();
    expect(undici).toBeTruthy();
    expect(typeof undici.fetch).toBe("function");
    expect(typeof undici.Agent).toBe("function");

    const lookup = createPinnedLookup(["8.8.8.8", "127.0.0.1"]);
    lookup("example.com", { all: true }, (err, records) => {
      expect(err).toBeNull();
      expect(records).toEqual([
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);
    });
    lookup("example.com", {}, (err, address, family) => {
      expect(err).toBeNull();
      expect(address).toBe("8.8.8.8");
      expect(family).toBe(4);
    });
    createPinnedLookup([])("x", {}, (err) => {
      expect(err).toBeInstanceOf(Error);
    });
  });

  it("builds Jina Reader proxy URLs and respects disable flag", () => {
    expect(buildJinaReaderUrl("https://www.trustpilot.com/review/x")).toBe(
      "https://r.jina.ai/https://www.trustpilot.com/review/x",
    );
    expect(buildJinaReaderUrl("")).toBe("");
    expect(isJinaReaderEnabled({ REVIEW_ENRICHMENT_JINA: "1" })).toBe(true);
    expect(isJinaReaderEnabled({ REVIEW_ENRICHMENT_JINA: "0" })).toBe(false);
    expect(isJinaReaderEnabled({ REVIEW_ENRICHMENT_JINA: "off" })).toBe(false);
  });

  it("maps Reddit HTML URLs to public JSON endpoints", () => {
    expect(isRedditUrl("https://www.reddit.com/r/x/comments/abc/title/")).toBe(true);
    expect(redditJsonUrl("https://www.reddit.com/r/x/comments/abc/title/")).toBe(
      "https://old.reddit.com/r/x/comments/abc/title.json",
    );
    expect(redditJsonUrl("https://old.reddit.com/search?q=foo&sort=relevance")).toContain(
      "/search.json?",
    );
    expect(redditJsonUrl("https://example.com/x")).toBe("");
  });

  it("extracts YouTube caption track URLs from watch HTML", () => {
    const html = `"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc\\u0026lang=en","languageCode":"en","kind":""}],"`;
    const urls = extractYouTubeCaptionTrackUrls(html);
    expect(urls[0]).toContain("timedtext");
    expect(urls[0]).toContain("lang=en");
  });
});

