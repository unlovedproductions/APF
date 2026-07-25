import * as cheerio from "cheerio";
import { classifySourceHost } from "./enrichment-source-trust.mjs";

const FETCHABLE_TIERS = new Set(["review", "scam_advisor", "retailer"]);
const BINARY_CONTENT_RE = /(?:application\/pdf|image\/|audio\/|video\/|application\/zip|application\/octet-stream)/i;

function cleanText(value, limit = 8000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isHighTrustFetchCandidate(source, vendorDomains = new Set()) {
  const host = hostnameFromUrl(source?.url);
  const tier = classifySourceHost(host).tier;
  return FETCHABLE_TIERS.has(tier) || vendorDomains.has(host);
}

export function extractMainText(html, limit = 8000) {
  const $ = cheerio.load(String(html || ""));
  $("script, style, noscript, svg, canvas, iframe, nav, footer, header, form").remove();
  const root = $("main, article, [role='main']").first();
  const content = root.length ? root : $("body");
  content.find("h1, h2, h3, h4, h5, h6, p, li, blockquote, section, div, br").append(" ");
  return cleanText(content.text(), limit);
}

export function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v") || "";
      const match = url.pathname.match(/^\/(?:shorts|embed)\/([^/?#]+)/);
      return match?.[1] || "";
    }
  } catch {
    return "";
  }
  return "";
}

async function fetchWithLimits(url, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
  const maxBytes = options.maxBytes || 1_000_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "APF-Enrichment/1.0 (+https://github.com/)",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    if (BINARY_CONTENT_RE.test(contentType)) throw new Error(`unsupported content type: ${contentType}`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) throw new Error(`response too large: ${contentLength}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(`response too large: ${bytes.byteLength}`);
    return {
      body: new TextDecoder().decode(bytes),
      contentType,
      finalUrl: response.url || url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYouTubeMetadata(url, options = {}) {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("format", "json");
  const response = await fetchWithLimits(endpoint.toString(), {
    timeoutMs: options.timeoutMs,
    maxBytes: 100_000,
  });
  const data = JSON.parse(response.body);
  return {
    video_title: cleanText(data.title, 500),
    channel_name: cleanText(data.author_name, 255),
    channel_url: cleanText(data.author_url, 1000),
  };
}

export async function enrichSourceContent(source, options = {}) {
  const rawJson = source?.raw_json && typeof source.raw_json === "object"
    ? source.raw_json
    : {};
  const cachedText = cleanText(rawJson.content_text, options.textLimit || 8000);
  if (cachedText) {
    return { ...source, raw_json: { ...rawJson, content_text: cachedText } };
  }

  const videoId = youtubeVideoId(source?.url);
  try {
    if (videoId) {
      const metadata = await fetchYouTubeMetadata(source.url, options);
      return {
        ...source,
        title: metadata.video_title || source.title,
        raw_json: {
          ...rawJson,
          ...metadata,
          youtube_video_id: videoId,
          fetched_at: new Date().toISOString(),
        },
      };
    }

    const response = await fetchWithLimits(source.url, options);
    const contentText = extractMainText(response.body, options.textLimit || 8000);
    if (!contentText) throw new Error("no readable page text");
    return {
      ...source,
      raw_json: {
        ...rawJson,
        content_text: contentText,
        content_type: response.contentType,
        final_url: response.finalUrl,
        fetched_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      ...source,
      raw_json: {
        ...rawJson,
        fetch_error: cleanText(error?.message || error, 500),
        fetch_attempted_at: new Date().toISOString(),
      },
    };
  }
}

export async function enrichHighTrustSources(sources, options = {}) {
  const vendorDomains = options.vendorDomains || new Set();
  const limit = Math.max(0, Number(options.limit ?? 4));
  const delayMs = Math.max(0, Number(options.delayMs ?? 250));
  const selected = new Set(
    sources
      .filter((source) => (
        isHighTrustFetchCandidate(source, vendorDomains)
        || Boolean(youtubeVideoId(source?.url))
      ))
      .slice(0, limit),
  );
  const enriched = [];

  for (const source of sources) {
    if (!selected.has(source)) {
      enriched.push(source);
      continue;
    }
    enriched.push(await enrichSourceContent(source, options));
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return enriched;
}
