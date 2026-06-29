#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

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

loadEnv(path.resolve(process.cwd(), ".env"));

const productId = process.argv[2];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing.");
  process.exit(1);
}
if (!productId) {
  console.error("Usage: pnpm run export:shadowcast <product_id>");
  process.exit(1);
}

function parseJson(v, fallback) {
  if (!v) return fallback;
  if (Array.isArray(v) || typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [products] = await conn.query(`
    SELECT
      id, platform, platformProductId, name, vendor, category, keywords, description,
      affiliateLink, hiddenGemScore, scoreComponents, commissionRate, commissionType,
      saleCount, aggregateSales, refundCount
    FROM products
    WHERE id=?
    LIMIT 1
  `, [productId]);

  if (!products.length) {
    console.error("Product not found:", productId);
    process.exit(1);
  }

  const p = products[0];

  const [briefRows] = await conn.query(
    `SELECT * FROM product_review_briefs WHERE product_id=? LIMIT 1`,
    [productId]
  );

  const [sources] = await conn.query(`
    SELECT source_type, source_name, title, url, snippet, relevance_score, trust_score, sentiment, discovered_at
    FROM product_review_sources
    WHERE product_id=?
    ORDER BY relevance_score DESC, trust_score DESC, id ASC
    LIMIT 25
  `, [productId]);

  const b = briefRows[0] || null;

  const payload = {
    schema_version: "apf_shadowcast_enriched_v1",
    exported_at: new Date().toISOString(),
    product: {
      source_product_id: String(p.id),
      marketplace: p.platform || "clickbank",
      platform_product_id: p.platformProductId || "",
      name: p.name || "",
      vendor: p.vendor || "",
      category: p.category || "",
      keywords: p.keywords || "",
      description: p.description || "",
      affiliate_url: p.affiliateLink || "",
      hidden_gem_score: p.hiddenGemScore ?? null,
      score_components: parseJson(p.scoreComponents, null),
      commission_rate: p.commissionRate ?? null,
      commission_type: p.commissionType ?? null,
      sale_count: p.saleCount ?? null,
      aggregate_sales: p.aggregateSales ?? null,
      refund_count: p.refundCount ?? null
    },
    review_enrichment: {
      status: b?.enrichment_status || "pending",
      source_count: b?.source_count || sources.length || 0,
      confidence_score: b?.confidence_score ?? null,
      last_enriched_at: b?.generated_at || null
    },
    review_brief: b ? {
      review_summary: b.review_summary || "",
      positive_signals: parseJson(b.positive_signals, []),
      negative_signals: parseJson(b.negative_signals, []),
      common_claims: parseJson(b.common_claims, []),
      common_complaints: parseJson(b.common_complaints, []),
      target_audience: b.target_audience || "",
      who_it_may_help: b.who_it_may_help || "",
      who_should_skip_it: b.who_should_skip_it || "",
      best_video_angles: parseJson(b.best_video_angles, []),
      cta_guidance: b.cta_guidance || ""
    } : null,
    review_sources: sources
  };

  const safe = String(p.name || `product_${productId}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const outDir = path.resolve(process.cwd(), "exports");
  fs.mkdirSync(outDir, {recursive: true});
  const out = path.join(outDir, `${safe || "product"}_shadowcast_enriched.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(out);

  await conn.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
