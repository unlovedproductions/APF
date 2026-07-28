import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import { classifySourceHost } from "./enrichment-source-trust.mjs";

const FETCHABLE_TIERS = new Set(["review", "scam_advisor", "retailer", "video"]);
const BINARY_CONTENT_RE = /(?:application\/pdf|image\/|audio\/|video\/|application\/zip|application\/octet-stream)/i;
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "metadata.azure.com",
  "kubernetes.default",
  "kubernetes.default.svc",
]);
/** Azure Instance Metadata Service — not covered by RFC1918 checks alone. */
const BLOCKED_EXPLICIT_IPS = new Set(["168.63.129.16"]);

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

/** True when an IP must not be fetched (loopback, RFC1918, link-local, ULA, CGNAT, metadata). */
export function isBlockedFetchIp(ip) {
  const raw = String(ip || "").trim().toLowerCase();
  if (!raw || !net.isIP(raw)) return true;
  if (BLOCKED_EXPLICIT_IPS.has(raw)) return true;

  if (net.isIP(raw) === 4) {
    const [a, b, c] = raw.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    return false;
  }

  if (raw === "::1" || raw === "::") return true;
  if (raw.startsWith("fc") || raw.startsWith("fd")) return true;
  if (raw.startsWith("fe80")) return true;
  if (raw.startsWith("::ffff:")) {
    const mapped = raw.slice("::ffff:".length);
    return isBlockedFetchIp(mapped);
  }
  return false;
}

export function isBlockedFetchHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "0.0.0.0") return true;
  return false;
}

/**
 * Reject non-http(s), credentials, blocked hosts, and private/link-local DNS answers.
 * Returns { url, addresses } so callers can re-check DNS immediately before connect (rebinding mitigation).
 */
export async function assertSafeFetchUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("URL credentials not allowed");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedFetchHostname(host)) {
    throw new Error(`blocked host: ${host}`);
  }

  if (net.isIP(host)) {
    if (isBlockedFetchIp(host)) throw new Error(`blocked IP: ${host}`);
    return { url, addresses: [host] };
  }

  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length) throw new Error(`DNS failed for ${host}`);
  const addresses = [];
  for (const record of records) {
    if (isBlockedFetchIp(record.address)) {
      throw new Error(`blocked IP ${record.address} for ${host}`);
    }
    addresses.push(record.address);
  }
  return { url, addresses };
}

/** Second DNS pass immediately before connect; fails closed if answers diverge into a blocked IP. */
export async function assertDnsStable(hostname, priorAddresses = []) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || net.isIP(host)) return priorAddresses;
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length) throw new Error(`DNS failed for ${host}`);
  const addresses = [];
  for (const record of records) {
    if (isBlockedFetchIp(record.address)) {
      throw new Error(`blocked IP ${record.address} for ${host} (rebinding check)`);
    }
    addresses.push(record.address);
  }
  if (priorAddresses.length) {
    const prior = new Set(priorAddresses);
    const overlap = addresses.some((ip) => prior.has(ip));
    if (!overlap) {
      throw new Error(`DNS answers changed for ${host} (possible rebinding)`);
    }
  }
  return addresses;
}

export function isHighTrustFetchCandidate(source, vendorDomains = new Set()) {
  const host = hostnameFromUrl(source?.url);
  const tier = classifySourceHost(host).tier;
  return FETCHABLE_TIERS.has(tier) || vendorDomains.has(host);
}

/**
 * True when cached page text is long enough and younger than maxAgeMs.
 * Missing fetched_at → treat as stale so refresh jobs re-fetch.
 */
export function isContentCacheFresh(rawJson = {}, options = {}) {
  if (options.forceRefresh) return false;
  const text = cleanText(rawJson?.content_text, options.textLimit || 8000);
  if (text.length < 80) return false;
  const maxAgeMs = Number(
    options.maxAgeMs
    ?? (Number(options.maxAgeDays || 14) * 24 * 60 * 60 * 1000),
  );
  const fetchedAt = Date.parse(String(rawJson?.fetched_at || ""));
  if (!Number.isFinite(fetchedAt)) return false;
  return (Date.now() - fetchedAt) <= maxAgeMs;
}

export function extractMainText(html, limit = 8000) {
  const $ = cheerio.load(String(html || ""));
  $("script, style, noscript, svg, canvas, iframe, nav, footer, header, form, aside, .ads, .advertisement, [role='navigation'], [role='banner'], [role='contentinfo']").remove();

  const preferred = $(
    "[itemprop='reviewBody'], .review-content, .reviewText, .review-body, "
    + "[data-service-review-text-typography], main article, article, main, [role='main']",
  ).first();
  const content = preferred.length ? preferred : ($("main, article").first().length ? $("main, article").first() : $("body"));
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
  const maxRedirects = Math.max(0, Number(options.maxRedirects ?? 5));
  let current = String(url);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safe = await assertSafeFetchUrl(current);
    await assertDnsStable(safe.url.hostname, safe.addresses);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "APF-Enrichment/1.0 (+https://github.com/)",
          "Accept": "text/html,application/xhtml+xml,application/json;q=0.8",
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("redirect without location");
        current = new URL(location, current).toString();
        continue;
      }

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
        finalUrl: response.url || current,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`too many redirects (>${maxRedirects})`);
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

function parseTimedTextXml(xml) {
  const $ = cheerio.load(String(xml || ""), { xmlMode: true });
  const chunks = [];
  $("text").each((_, el) => {
    const piece = cleanText($(el).text(), 2000);
    if (piece) chunks.push(piece);
  });
  return cleanText(chunks.join(" "), 8000);
}

/** Prefer TranscriptAPI when keyed; else YouTube timedtext (no new deps). */
export async function fetchYouTubeTranscript(videoId, options = {}) {
  const id = String(videoId || "").trim();
  if (!id) return "";

  const apiKey = process.env.TRANSCRIPT_API_KEY || "";
  if (apiKey) {
    try {
      const endpoint = new URL("https://transcriptapi.com/api/v2/youtube/transcript");
      endpoint.searchParams.set("video_url", `https://www.youtube.com/watch?v=${id}`);
      endpoint.searchParams.set("format", "text");
      endpoint.searchParams.set("include_timestamp", "false");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
      try {
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "User-Agent": "APF-Enrichment/1.0",
          },
        });
        if (res.ok) {
          const payload = await res.json().catch(() => null);
          const text = cleanText(
            payload?.transcript || payload?.text || payload?.data?.transcript || "",
            options.textLimit || 8000,
          );
          if (text) return text;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // fall through to timedtext
    }
  }

  try {
    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(id)}`;
    const list = await fetchWithLimits(listUrl, {
      timeoutMs: options.timeoutMs,
      maxBytes: 200_000,
    });
    const $ = cheerio.load(list.body, { xmlMode: true });
    let lang = "";
    $("track").each((_, el) => {
      if (lang) return;
      const code = String($(el).attr("lang_code") || "");
      if (/^en/i.test(code) || $(el).attr("lang_default") === "true") lang = code;
    });
    if (!lang) {
      const first = $("track").first().attr("lang_code");
      if (first) lang = first;
    }
    if (!lang) return "";

    const trackUrl = `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(id)}`;
    const track = await fetchWithLimits(trackUrl, {
      timeoutMs: options.timeoutMs,
      maxBytes: 1_000_000,
    });
    return parseTimedTextXml(track.body).slice(0, options.textLimit || 8000);
  } catch {
    return "";
  }
}

export async function enrichSourceContent(source, options = {}) {
  const rawJson = source?.raw_json && typeof source.raw_json === "object"
    ? source.raw_json
    : {};
  if (isContentCacheFresh(rawJson, options)) {
    const cachedText = cleanText(rawJson.content_text, options.textLimit || 8000);
    return { ...source, raw_json: { ...rawJson, content_text: cachedText } };
  }

  const videoId = youtubeVideoId(source?.url);
  try {
    if (videoId) {
      const metadata = await fetchYouTubeMetadata(source.url, options);
      const transcript = await fetchYouTubeTranscript(videoId, options);
      return {
        ...source,
        title: metadata.video_title || source.title,
        raw_json: {
          ...rawJson,
          ...metadata,
          youtube_video_id: videoId,
          content_text: transcript || cleanText(
            [metadata.video_title, metadata.channel_name, source.snippet]
              .filter(Boolean)
              .join(" — "),
            options.textLimit || 8000,
          ),
          transcript_fetched: Boolean(transcript),
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
