#!/usr/bin/env node
/**
 * Way 3 Phase B — Trustpilot Business Units API → product_review_sources.
 *
 * Requires TRUSTPILOT_API_KEY (apikey header). Public HTML scrape is blocked
 * (403/bot walls); do not rely on browser login for this path.
 *
 * Usage:
 *   pnpm review:trustpilot --dry-run
 *   pnpm review:trustpilot --apply
 *   pnpm review:trustpilot --apply --product-id 3 --max-reviews 40
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const API_BASE = "https://api.trustpilot.com/v1";
const CURSOR_PATH = path.resolve(".data/trustpilot-cursors.json");

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] ||= v;
  }
}

loadEnv();

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function clamp(s, n) {
  const t = String(s ?? "");
  return t.length <= n ? t : t.slice(0, n);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadCursors() {
  try {
    if (!fs.existsSync(CURSOR_PATH)) return {};
    return JSON.parse(fs.readFileSync(CURSOR_PATH, "utf8")) || {};
  } catch {
    return {};
  }
}

function saveCursors(data) {
  fs.mkdirSync(path.dirname(CURSOR_PATH), { recursive: true });
  fs.writeFileSync(CURSOR_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

export function scoreBusinessUnit(unit, productName) {
  const identifying = String(unit?.name?.identifying || "").toLowerCase();
  const display = String(unit?.displayName || "").toLowerCase();
  const referring = (unit?.name?.referring || []).map((x) => String(x).toLowerCase());
  const hay = [identifying, display, ...referring].join(" ");
  const tokens = String(productName || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }
  // Prefer product-like units; deprioritize marketplace noise.
  if (/digistore|clickbank|hotmart|partnerstack|checkout-ds24/i.test(hay)) score -= 8;
  if (identifying && tokens.some((t) => identifying.includes(t))) score += 3;
  return score;
}

async function tpGet(pathname, { apiKey, query = {} }) {
  const url = new URL(`${API_BASE}${pathname}`);
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      apikey: apiKey,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg = body?.message || body?.fault?.faultstring || text.slice(0, 300);
    const err = new Error(`Trustpilot ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function searchBusinessUnit(apiKey, query) {
  const data = await tpGet("/business-units/search", {
    apiKey,
    query: { query, perpage: 20 },
  });
  return Array.isArray(data?.businessUnits) ? data.businessUnits : [];
}

async function* paginateReviews(apiKey, businessUnitId, { startToken = "", maxReviews = 40 }) {
  let pageToken = startToken || "";
  let yielded = 0;
  while (yielded < maxReviews) {
    const data = await tpGet(`/business-units/${businessUnitId}/all-reviews`, {
      apiKey,
      query: pageToken ? { pageToken } : {},
    });
    const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
    for (const review of reviews) {
      yield review;
      yielded += 1;
      if (yielded >= maxReviews) return { nextPageToken: data?.nextPageToken || "" };
    }
    pageToken = data?.nextPageToken || "";
    if (!pageToken || reviews.length === 0) {
      return { nextPageToken: "" };
    }
    await sleep(250);
  }
  return { nextPageToken: pageToken };
}

export function reviewToSource(product, review, businessUnit) {
  const id = String(review.id || "");
  const title = String(review.title || "").trim();
  const text = String(review.text || "").trim();
  const body = [title, text].filter(Boolean).join("\n\n").trim();
  const url = id
    ? `https://www.trustpilot.com/reviews/${id}`
    : `https://www.trustpilot.com/review/${businessUnit?.name?.identifying || "unknown"}#${review.createdAt || Date.now()}`;
  const stars = Number(review.stars) || 0;
  return {
    product_id: product.id,
    source_type: "review",
    source_name: "Trustpilot",
    title: title || `Trustpilot ${stars}-star review`,
    url,
    snippet: clamp(text || title, 400),
    relevance_score: 75,
    trust_score: review.isVerified ? 88 : 80,
    sentiment: stars >= 4 ? "positive" : stars <= 2 ? "negative" : "mixed",
    raw_json: {
      content_text: body,
      fetch_provider: "trustpilot_api",
      trustpilot_review_id: id || null,
      trustpilot_business_unit_id: businessUnit?.id || null,
      trustpilot_business_unit: businessUnit?.name?.identifying || null,
      stars,
      is_verified: Boolean(review.isVerified),
      language: review.language || null,
      created_at: review.createdAt || null,
      consumer: review.consumer?.displayName || null,
    },
  };
}

async function upsertSource(conn, s) {
  await conn.query(
    `
    INSERT INTO product_review_sources
    (product_id, source_type, source_name, title, url, snippet, relevance_score, trust_score, sentiment, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))
    ON DUPLICATE KEY UPDATE
      source_type=VALUES(source_type),
      source_name=VALUES(source_name),
      title=VALUES(title),
      snippet=VALUES(snippet),
      relevance_score=VALUES(relevance_score),
      trust_score=VALUES(trust_score),
      sentiment=VALUES(sentiment),
      raw_json=VALUES(raw_json),
      discovered_at=NOW()
  `,
    [
      s.product_id,
      s.source_type,
      s.source_name,
      clamp(s.title, 1000),
      s.url,
      clamp(s.snippet, 1000),
      s.relevance_score,
      s.trust_score,
      s.sentiment,
      JSON.stringify(s.raw_json || {}),
    ],
  );
}

async function main() {
  const apply = hasFlag("--apply");
  const dryRun = hasFlag("--dry-run") || !apply;
  const productId = arg("--product-id", "");
  const maxReviews = Math.max(1, Number(arg("--max-reviews", "40")) || 40);
  const platform = arg("--platform", "digistore24");
  const apiKey = process.env.TRUSTPILOT_API_KEY || process.env.TRUSTPILOT_APIKEY || "";

  if (!apiKey) {
    console.error(
      [
        "Missing TRUSTPILOT_API_KEY.",
        "Get an API key from https://developers.trustpilot.com/ and add to .env:",
        "  TRUSTPILOT_API_KEY=...",
        "Then: pnpm review:trustpilot --dry-run",
        "Apply: pnpm review:trustpilot --apply",
      ].join("\n"),
    );
    process.exit(2);
  }

  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(2);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const cursors = loadCursors();

  let sql = `SELECT id, name, vendor, platform FROM products WHERE platform = ?`;
  const params = [platform];
  if (productId) {
    sql += ` AND id = ?`;
    params.push(Number(productId));
  }
  sql += ` ORDER BY id`;
  const [products] = await conn.query(sql, params);

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        products: products.length,
        maxReviews,
        platform,
      },
      null,
      2,
    ),
  );

  const summary = [];

  for (const product of products) {
    const query = String(product.name || "").replace(/\s+/g, " ").trim();
    let units = [];
    try {
      units = await searchBusinessUnit(apiKey, query);
      await sleep(200);
    } catch (err) {
      console.error(`[${product.id}] search failed:`, err.message);
      summary.push({ product_id: product.id, error: err.message });
      continue;
    }

    const ranked = units
      .map((u) => ({ unit: u, score: scoreBusinessUnit(u, product.name) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 2) {
      console.log(`[${product.id}] no usable business unit for "${query}"`);
      summary.push({
        product_id: product.id,
        name: product.name,
        matched: null,
        reviews: 0,
      });
      continue;
    }

    const unit = best.unit;
    const cursorKey = `${product.id}:${unit.id}`;
    const startToken = cursors[cursorKey]?.nextPageToken || "";
    console.log(
      `[${product.id}] unit=${unit.id} identifying=${unit.name?.identifying} score=${best.score} resume=${Boolean(startToken)}`,
    );

    let upserted = 0;
    let skippedThin = 0;
    let nextPageToken = startToken;

    try {
      const gen = paginateReviews(apiKey, unit.id, { startToken, maxReviews });
      let step = await gen.next();
      while (!step.done) {
        const review = step.value;
        const source = reviewToSource(product, review, unit);
        const bodyLen = String(source.raw_json.content_text || "").length;
        if (bodyLen < 50) {
          skippedThin += 1;
        } else if (dryRun) {
          upserted += 1;
          if (upserted <= 2) {
            console.log(
              `  dry ${source.url} stars=${source.raw_json.stars} len=${bodyLen}`,
            );
          }
        } else {
          await upsertSource(conn, source);
          upserted += 1;
        }
        step = await gen.next();
      }
      nextPageToken = step.value?.nextPageToken || "";
    } catch (err) {
      console.error(`[${product.id}] reviews failed:`, err.message);
      summary.push({
        product_id: product.id,
        business_unit_id: unit.id,
        error: err.message,
      });
      continue;
    }

    cursors[cursorKey] = {
      product_id: product.id,
      business_unit_id: unit.id,
      identifying: unit.name?.identifying || null,
      nextPageToken,
      updated_at: new Date().toISOString(),
    };

    summary.push({
      product_id: product.id,
      name: product.name,
      business_unit_id: unit.id,
      identifying: unit.name?.identifying,
      match_score: best.score,
      upserted,
      skipped_thin: skippedThin,
      next_page: Boolean(nextPageToken),
    });
  }

  if (!dryRun) saveCursors(cursors);
  await conn.end();
  console.log(JSON.stringify({ summary }, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}