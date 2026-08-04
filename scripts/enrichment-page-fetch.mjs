import dns from "node:dns/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { classifySourceHost } from "./enrichment-source-trust.mjs";
import {
  canFirecrawlScrape,
  firecrawlScrape,
  isFirecrawlConfigured,
} from "./enrichment-firecrawl.mjs";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Load transitive undici (pnpm hoisted) without adding a package dependency. */
export function loadUndici() {
  const candidates = [
    "undici",
    path.join(__dirname, "../node_modules/undici"),
    path.join(__dirname, "../node_modules/.pnpm/node_modules/undici"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * DNS lookup override that returns only pre-validated addresses (true IP pin).
 * Host/SNI still come from the request URL hostname.
 */
export function createPinnedLookup(pinnedAddresses = []) {
  const records = (Array.isArray(pinnedAddresses) ? pinnedAddresses : [])
    .map((address) => {
      const ip = String(address || "").trim();
      const family = net.isIP(ip);
      return family ? { address: ip, family } : null;
    })
    .filter(Boolean);
  return function pinnedLookup(hostname, options, callback) {
    if (!records.length) {
      callback(new Error(`no pinned addresses for ${hostname}`));
      return;
    }
    if (options?.all) {
      callback(null, records.map((r) => ({ address: r.address, family: r.family })));
      return;
    }
    callback(null, records[0].address, records[0].family);
  };
}

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

function fetchTierRank(source, vendorDomains = new Set()) {
  const host = hostnameFromUrl(source?.url);
  const tier = classifySourceHost(host).tier;
  if (youtubeVideoId(source?.url)) return 0;
  if (tier === "review" || tier === "scam_advisor") return 1;
  if (tier === "video") return 2;
  if (tier === "retailer") return 3;
  if (vendorDomains.has(host)) return 4;
  return 5;
}

function isPermanentFetchError(message) {
  const msg = String(message || "").toLowerCase();
  return /http 404|http 410|unsupported content type|invalid url|blocked (host|ip)|unsupported protocol/.test(msg);
}

/**
 * Prefer review/scam/video URLs, skip permanent fetch failures, try extras until
 * we fill `limit` successful content_text captures (or exhaust candidates).
 */
export function selectPageFetchCandidates(sources = [], options = {}) {
  const vendorDomains = options.vendorDomains || new Set();
  const limit = Math.max(0, Number(options.limit ?? 6));
  const maxAttempts = Math.max(limit, Number(options.maxAttempts ?? limit * 3));

  const eligible = sources
    .filter((source) => (
      isHighTrustFetchCandidate(source, vendorDomains)
      || Boolean(youtubeVideoId(source?.url))
    ))
    .filter((source) => !isPermanentFetchError(source?.raw_json?.fetch_error))
    .sort((a, b) => {
      const tierDelta = fetchTierRank(a, vendorDomains) - fetchTierRank(b, vendorDomains);
      if (tierDelta !== 0) return tierDelta;
      const scoreA = Number(a.relevance_score || 0) + Number(a.trust_score || 0);
      const scoreB = Number(b.relevance_score || 0) + Number(b.trust_score || 0);
      return scoreB - scoreA;
    });

  return {
    candidates: eligible.slice(0, maxAttempts),
    successLimit: limit,
  };
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
  const undici = options.undici || loadUndici();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safe = await assertSafeFetchUrl(current);
    const addresses = await assertDnsStable(safe.url.hostname, safe.addresses);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        "User-Agent": "APF-Enrichment/1.0 (+https://github.com/)",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.8",
      };

      let response;
      let dispatcher;
      if (undici?.Agent && undici?.fetch && addresses.length && !net.isIP(safe.url.hostname.replace(/^\[|\]$/g, ""))) {
        dispatcher = new undici.Agent({
          connect: {
            lookup: createPinnedLookup(addresses),
          },
        });
        try {
          response = await undici.fetch(current, {
            redirect: "manual",
            signal: controller.signal,
            headers,
            dispatcher,
          });
        } finally {
          try { await dispatcher.close(); } catch { /* ignore */ }
        }
      } else {
        response = await fetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers,
        });
      }

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
    const tracks = [];
    $("track").each((_, el) => {
      tracks.push({
        lang: String($(el).attr("lang_code") || "").trim(),
        name: String($(el).attr("name") || ""),
        kind: String($(el).attr("kind") || "").toLowerCase(),
        isDefault: $(el).attr("lang_default") === "true",
      });
    });
    if (!tracks.length) return "";

    const scoreTrack = (t) => {
      let score = 0;
      if (/^en([_-]|$)/i.test(t.lang)) score += 100;
      if (t.isDefault) score += 40;
      if (t.kind !== "asr" && !/auto[- ]?generat/i.test(t.name)) score += 25;
      if (/^en/i.test(t.lang)) score += 10;
      return score;
    };
    tracks.sort((a, b) => scoreTrack(b) - scoreTrack(a));

    const textLimit = options.textLimit || 8000;
    for (const track of tracks.slice(0, 6)) {
      if (!track.lang) continue;
      const variants = [
        `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(track.lang)}&v=${encodeURIComponent(id)}`,
        `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(track.lang)}&v=${encodeURIComponent(id)}&fmt=srv1`,
        `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(track.lang)}&v=${encodeURIComponent(id)}&fmt=srv3`,
      ];
      if (track.kind === "asr" || /auto[- ]?generat/i.test(track.name)) {
        variants.push(
          `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(track.lang)}&v=${encodeURIComponent(id)}&kind=asr`,
        );
      }
      for (const trackUrl of variants) {
        try {
          const body = await fetchWithLimits(trackUrl, {
            timeoutMs: options.timeoutMs,
            maxBytes: 1_000_000,
          });
          const text = parseTimedTextXml(body.body).slice(0, textLimit);
          if (text.length >= 40) return text;
        } catch {
          // try next variant / language
        }
      }
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * When local fetch is thin/failed (non-permanent), try Firecrawl scrape if configured + budget.
 * SSRF-checked before leaving the box. Skips YouTube (dedicated path).
 */
async function tryFirecrawlPageFallback(source, rawJson, options = {}) {
  if (options.allowFirecrawl === false) return null;
  if (!isFirecrawlConfigured() || !canFirecrawlScrape()) return null;
  if (youtubeVideoId(source?.url)) return null;

  try {
    await assertSafeFetchUrl(source.url);
  } catch {
    return null;
  }

  try {
    const scraped = await firecrawlScrape(source.url, {
      textLimit: options.textLimit || 8000,
    });
    const contentText = cleanText(scraped.content_text, options.textLimit || 8000);
    if (contentText.length < 80) return null;
    return {
      ...source,
      raw_json: {
        ...rawJson,
        content_text: contentText,
        fetched_at: new Date().toISOString(),
        fetch_provider: "firecrawl",
        fetch_error: undefined,
      },
    };
  } catch (error) {
    return {
      ...source,
      raw_json: {
        ...rawJson,
        fetch_error: cleanText(error?.message || error, 500),
        fetch_attempted_at: new Date().toISOString(),
        fetch_provider: "firecrawl_failed",
      },
    };
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
          fetch_provider: "youtube",
        },
      };
    }

    const response = await fetchWithLimits(source.url, options);
    const contentText = extractMainText(response.body, options.textLimit || 8000);
    if (contentText.length >= 80) {
      return {
        ...source,
        raw_json: {
          ...rawJson,
          content_text: contentText,
          content_type: response.contentType,
          final_url: response.finalUrl,
          fetched_at: new Date().toISOString(),
          fetch_provider: "local",
          fetch_error: undefined,
        },
      };
    }

    const viaFirecrawl = await tryFirecrawlPageFallback(source, {
      ...rawJson,
      content_type: response.contentType,
      final_url: response.finalUrl,
      local_content_text: contentText || undefined,
    }, options);
    if (viaFirecrawl?.raw_json?.content_text
      && cleanText(viaFirecrawl.raw_json.content_text).length >= 80) {
      return viaFirecrawl;
    }

    if (!contentText) throw new Error("no readable page text");
    return {
      ...source,
      raw_json: {
        ...rawJson,
        content_text: contentText,
        content_type: response.contentType,
        final_url: response.finalUrl,
        fetched_at: new Date().toISOString(),
        fetch_provider: "local",
        fetch_error: undefined,
      },
    };
  } catch (error) {
    const msg = cleanText(error?.message || error, 500);
    if (isPermanentFetchError(msg)) {
      return {
        ...source,
        raw_json: {
          ...rawJson,
          fetch_error: msg,
          fetch_attempted_at: new Date().toISOString(),
        },
      };
    }

    const viaFirecrawl = await tryFirecrawlPageFallback(source, {
      ...rawJson,
      local_fetch_error: msg,
    }, options);
    if (viaFirecrawl?.raw_json?.content_text
      && cleanText(viaFirecrawl.raw_json.content_text).length >= 80) {
      return viaFirecrawl;
    }

    return {
      ...source,
      raw_json: {
        ...rawJson,
        fetch_error: viaFirecrawl?.raw_json?.fetch_error || msg,
        fetch_attempted_at: new Date().toISOString(),
      },
    };
  }
}

export async function enrichHighTrustSources(sources, options = {}) {
  const vendorDomains = options.vendorDomains || new Set();
  const limit = Math.max(0, Number(options.limit ?? 6));
  const delayMs = Math.max(0, Number(options.delayMs ?? 250));
  const { candidates, successLimit } = selectPageFetchCandidates(sources, {
    vendorDomains,
    limit,
    maxAttempts: options.maxAttempts,
  });
  const selectedUrls = new Set(candidates.map((s) => s.url));
  const enrichedByUrl = new Map();
  let successes = 0;

  for (const source of candidates) {
    if (successes >= successLimit) break;
    const enriched = await enrichSourceContent(source, options);
    enrichedByUrl.set(source.url, enriched);
    const textLen = cleanText(enriched?.raw_json?.content_text, options.textLimit || 8000).length;
    if (textLen >= 80) successes += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return sources.map((source) => {
    if (!selectedUrls.has(source.url)) return source;
    return enrichedByUrl.get(source.url) || source;
  });
}
