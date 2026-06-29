import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

export function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;

    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }

    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(path.resolve(process.cwd(), ".env"));

export function parseJson(v, fallback) {
  if (!v) return fallback;
  if (Array.isArray(v) || typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

export function shadowcastBaseUrl() {
  return process.env.SHADOWCAST_BASE_URL || "http://localhost:8000";
}

export async function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing from APF .env");
  }
  return mysql.createConnection(process.env.DATABASE_URL);
}

export async function listProducts(q = "") {
  const conn = await db();
  try {
    const [rows] = await conn.query(`
      SELECT
        p.id,
        p.name,
        p.vendor,
        p.category,
        p.hiddenGemScore,
        p.affiliateLink,
        b.enrichment_status,
        b.source_count,
        b.confidence_score,
        b.generated_at
      FROM products p
      LEFT JOIN product_review_briefs b ON b.product_id = p.id
      WHERE
        (? = ''
          OR p.name LIKE CONCAT('%', ?, '%')
          OR p.vendor LIKE CONCAT('%', ?, '%')
          OR p.category LIKE CONCAT('%', ?, '%'))
      ORDER BY COALESCE(p.lastUpdatedAt, p.createdAt) DESC
      LIMIT 200
    `, [q, q, q, q]);

    return rows;
  } finally {
    await conn.end();
  }
}

export async function buildPayload(productId) {
  const conn = await db();

  try {
    const [products] = await conn.query(`
      SELECT
        id,
        platform,
        platformProductId,
        name,
        vendor,
        category,
        keywords,
        description,
        affiliateLink,
        hiddenGemScore,
        scoreComponents,
        commissionRate,
        commissionType,
        saleCount,
        aggregateSales,
        refundCount
      FROM products
      WHERE id=?
      LIMIT 1
    `, [productId]);

    if (!products.length) {
      throw new Error(`Product not found: ${productId}`);
    }

    const p = products[0];

    const [briefRows] = await conn.query(
      `SELECT * FROM product_review_briefs WHERE product_id=? LIMIT 1`,
      [productId]
    );

    const [sources] = await conn.query(`
      SELECT
        source_type,
        source_name,
        title,
        url,
        snippet,
        relevance_score,
        trust_score,
        sentiment,
        discovered_at
      FROM product_review_sources
      WHERE product_id=?
      ORDER BY relevance_score DESC, trust_score DESC, id ASC
      LIMIT 25
    `, [productId]);

    const b = briefRows[0] || null;

    return {
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
  } finally {
    await conn.end();
  }
}

export async function sendToShadowCast(productId) {
  const payload = await buildPayload(productId);
  const url = new URL("/api/import-apf/direct", shadowcastBaseUrl());

  const headers = {
    "Content-Type": "application/json"
  };

  if (process.env.INTERNAL_SERVICE_SECRET) {
    headers["X-Internal-Service-Secret"] = process.env.INTERNAL_SERVICE_SECRET;
    headers["Authorization"] = `Bearer ${process.env.INTERNAL_SERVICE_SECRET}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`ShadowCast direct import failed ${res.status}: ${(await res.text()).slice(0, 1000)}`);
  }

  return res.json();
}
