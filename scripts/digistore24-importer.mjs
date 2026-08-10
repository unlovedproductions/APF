#!/usr/bin/env node
import fs from "node:fs";
import mysql from "mysql2/promise";
import { queueReview, upsertAffiliateLink } from "./apf-db-helpers.mjs";
import { resolveProductCategory } from "./digistore24-detail-extractor.mjs";

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
const DS24_API_KEY = process.env.DIGISTORE24_API_KEY;
const DS24_API_BASE = (process.env.DIGISTORE24_API_BASE_URL || "https://www.digistore24.com/api/call").replace(/\/+$/, "");
const DS24_ID = process.env.DIGISTORE24_ID || "UnlovedProducts";
const APF_USER_ID = Number(process.env.APF_USER_ID || "0");
const PROMO_BASE = (process.env.DIGISTORE24_PROMOLINK_BASE_URL || "https://www.checkout-ds24.com/redir").replace(/\/+$/, "");
const CAMPAIGN_PREFIX = process.env.DIGISTORE24_CAMPAIGN_PREFIX || "apf";
const SEARXNG_BASE_URL = process.env.SEARXNG_BASE_URL || "http://localhost:8088";

const MODE =
  process.argv.includes("--api") ? "api" :
  process.argv.includes("--discover") ? "discover" :
  process.argv.includes("--all") ? "all" :
  "help";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : (process.argv[i + 1] || fallback);
}

const LIMIT = Number(arg("--limit", "50"));
const QUERY = arg("--query", "");

if (!DATABASE_URL) {
  console.error("DATABASE_URL missing from APF .env");
  process.exit(1);
}

function clean(v, max = 2000) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanProductId(v) {
  return String(v || "").replace(/[^0-9]/g, "");
}

function campaignKey(productId) {
  return `${CAMPAIGN_PREFIX}_${String(productId).replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 80);
}

function promolink(productId) {
  const id = cleanProductId(productId);
  if (!id) return "";
  return `${PROMO_BASE}/${encodeURIComponent(id)}/${encodeURIComponent(DS24_ID)}/${encodeURIComponent(campaignKey(id))}`;
}

function extractProductIdFromUrl(url) {
  const value = String(url || "");
  for (const pattern of [
    /digistore24\.com\/product\/(\d+)/i,
    /checkout-ds24\.com\/redir\/(\d+)/i,
    /\/redir\/(\d+)\//i,
    /[?&]product_id=(\d+)/i,
    /[?&]product=(\d+)/i
  ]) {
    const m = value.match(pattern);
    if (m) return m[1];
  }
  return "";
}

async function ds24Call(endpoint) {
  if (!DS24_API_KEY) throw new Error("DIGISTORE24_API_KEY missing from APF .env");

  const res = await fetch(`${DS24_API_BASE}/${endpoint}`, {
    headers: {
      "X-DS-API-KEY": DS24_API_KEY,
      "Accept": "application/json"
    }
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`Digistore24 returned non-JSON: ${text.slice(0, 300)}`); }

  if (!res.ok || json.result !== "success") {
    throw new Error(`Digistore24 API failed: ${json.message || res.status}`);
  }

  return json.data || {};
}

async function searxngSearch(query) {
  const url = new URL("/search", SEARXNG_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`SearXNG failed ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = await res.json();
  return json.results || [];
}

async function columns(conn, table) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  return rows.map(r => r.Field);
}

async function firstUserId(conn) {
  try {
    const [rows] = await conn.query(`SELECT id FROM users ORDER BY createdAt ASC LIMIT 1`);
    return rows[0]?.id || null;
  } catch {
    return null;
  }
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["products", "entries", "items", "marketplace_entries"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeApiProduct(raw) {
  const productId = cleanProductId(
    raw.id ||
    raw.product_id ||
    raw.productId ||
    raw.product ||
    raw.product_id_str ||
    raw.productIdStr ||
    ""
  );

  const name = clean(
    raw.name ||
    raw.product_name ||
    raw.productName ||
    raw.title ||
    raw.product_title ||
    `Digistore24 Product ${productId}`,
    255
  );

  return {
    platformProductId: productId,
    name,
    vendor: clean(raw.vendor || raw.vendor_name || raw.seller || raw.merchant || raw.owner || "", 255),
    category: resolveProductCategory({ category: clean(raw.category || raw.product_type || raw.productType || "", 255), name: clean(raw.name || raw.title || "", 255) }),
    description: clean(raw.description || raw.short_description || raw.subtitle || raw.summary || "", 2000),
    sourceUrl: "",
    raw
  };
}

function normalizeDiscovered(result) {
  const id = extractProductIdFromUrl(result.url);
  const title = clean(result.title || "", 255)
    .replace(/\s*-\s*Digistore24.*$/i, "")
    .replace(/\s*\|\s*Digistore24.*$/i, "")
    .trim();

  return {
    platformProductId: id,
    name: title || `Digistore24 Product ${id}`,
    vendor: "",
    category: resolveProductCategory({ name: title || `Digistore24 Product ${id}` }),
    description: clean(result.content || result.description || "", 2000),
    sourceUrl: result.url,
    raw: result
  };
}

async function saveAffiliateLink(conn, productRowId, platformProductId, vendor = "") {
  const link = promolink(platformProductId);
  if (!link) return "";

  await upsertAffiliateLink(conn, {
    productId: productRowId,
    provider: "digistore24",
    affiliateNickname: DS24_ID,
    vendorNickname: vendor || "",
    platformProductId,
    affiliateUrl: link,
    campaignKey: campaignKey(platformProductId),
    status: "generated",
    notes: "Generated by APF Digistore24 importer",
  });

  await conn.query(`
    UPDATE products
    SET affiliateLink=?, platform='digistore24', lastUpdatedAt=NOW()
    WHERE id=?
  `, [link, productRowId]);

  return link;
}

async function upsertProduct(conn, item, source) {
  if (!Number.isFinite(APF_USER_ID) || APF_USER_ID <= 0) {
    throw new Error("APF_USER_ID must be set to a valid logged-in user id.");
  }
  if (!item.platformProductId) return { status: "skipped_missing_product_id", name: item.name };
  if (!item.name) return { status: "skipped_missing_name", platformProductId: item.platformProductId };

  const [existing] = await conn.query(`
    SELECT id FROM products
    WHERE userId=? AND platform='digistore24' AND platformProductId=?
    LIMIT 1
  `, [APF_USER_ID, item.platformProductId]);

  if (existing.length) {
    const id = existing[0].id;

    await conn.query(`
      UPDATE products
      SET name=?, vendor=?, category=?, description=?, keywords=?, lastUpdatedAt=NOW()
      WHERE id=?
    `, [
      item.name,
      item.vendor,
      item.category,
      item.description,
      `${item.name}, ${item.category}, Digistore24, review, pros and cons`,
      id
    ]);

    const affiliateLink = await saveAffiliateLink(conn, id, item.platformProductId, item.vendor);
    await queueReview(conn, id);

    return { status: "updated", id, name: item.name, platformProductId: item.platformProductId, affiliateLink };
  }

  const productColumns = await columns(conn, "products");
  const data = {
    platform: "digistore24",
    platformProductId: item.platformProductId,
    name: item.name,
    vendor: item.vendor || "",
    category: resolveProductCategory({ category: item.category, name: item.name }),
    keywords: `${item.name}, ${resolveProductCategory({ category: item.category, name: item.name }) || "affiliate"}, Digistore24, review, pros and cons`,
    description: item.description || "",
    saleCount: 0,
    aggregateSales: 0,
    refundCount: 0,
    commissionRate: null,
    commissionType: "affiliate",
    affiliateLink: promolink(item.platformProductId),
    hiddenGemScore: 0,
    scoreComponents: JSON.stringify({
      marketplace: "digistore24",
      source,
      affiliate_id: DS24_ID,
      source_url: item.sourceUrl || ""
    }),
    createdAt: new Date(),
    platformCreatedAt: new Date(),
    lastUpdatedAt: new Date()
  };

  if (productColumns.includes("userId")) {
    data.userId = APF_USER_ID;
  }

  const keys = Object.keys(data).filter(k => productColumns.includes(k));
  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT INTO products (${keys.map(k => `\`${k}\``).join(", ")}) VALUES (${placeholders})`;
  const [result] = await conn.query(sql, keys.map(k => data[k]));

  const id = result.insertId;
  const affiliateLink = await saveAffiliateLink(conn, id, item.platformProductId, item.vendor);
  await queueReview(conn, id);

  return { status: "inserted", id, name: item.name, platformProductId: item.platformProductId, affiliateLink };
}

async function importApi(conn) {
  console.log("Importing from Digistore24 API listProducts...");
  const data = await ds24Call("listProducts");
  const items = extractArray(data).slice(0, LIMIT).map(normalizeApiProduct);

  console.log(`API product candidates: ${items.length}`);

  const out = [];
  for (const item of items) out.push(await upsertProduct(conn, item, "digistore24_api_listProducts"));
  console.table(out);
}

async function discover(conn) {
  console.log("Discovering public Digistore24 product pages through SearXNG...");

  const queries = QUERY ? [QUERY] : [
    "site:digistore24.com/product health affiliate",
    "site:digistore24.com/product fitness affiliate",
    "site:digistore24.com/product weight loss affiliate",
    "site:digistore24.com/product wellness affiliate",
    "site:digistore24.com/product software affiliate",
    "site:checkout-ds24.com/redir Digistore24 affiliate"
  ];

  const seen = new Set();
  const items = [];

  for (const q of queries) {
    console.log(`Search: ${q}`);
    const results = await searxngSearch(q);

    for (const r of results) {
      const id = extractProductIdFromUrl(r.url);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push(normalizeDiscovered(r));
      if (items.length >= LIMIT) break;
    }

    if (items.length >= LIMIT) break;
  }

  console.log(`Discovered candidates: ${items.length}`);

  const out = [];
  for (const item of items) out.push(await upsertProduct(conn, item, "searxng_digistore24_public_discovery"));
  console.table(out);
}

async function main() {
  if (MODE === "help") {
    console.log(`Usage:
  pnpm run digistore24:import-api -- --limit 50
  pnpm run digistore24:discover -- --limit 50
  pnpm run digistore24:discover -- --query "site:digistore24.com/product health" --limit 25
  pnpm run digistore24:import-all -- --limit 50`);
    return;
  }

  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    if (MODE === "api" || MODE === "all") await importApi(conn);
    if (MODE === "discover" || MODE === "all") await discover(conn);

    console.log("");
    console.log("Done.");
    console.log("Next:");
    console.log("  pnpm run review:once");
    console.log("  pnpm run shadowcast:export-ui");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
