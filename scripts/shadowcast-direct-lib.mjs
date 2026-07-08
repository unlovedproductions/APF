import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { normalizeKeywordList, safeJsonParse } from "./apf-db-helpers.mjs";

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

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return normalizeKeywordList(value);
  return [];
}

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function digistore24DetailUrlForShadowCast(product) {
  const components = parseJson(product.scoreComponents, {}) || {};
  const meta = components._meta || components.meta || {};

  if (clean(meta.detail_url)) return clean(meta.detail_url);
  if (clean(product.detailUrl)) return clean(product.detailUrl);

  const platform = clean(product.platform).toLowerCase();
  const pid = clean(product.platformProductId);

  if ((platform.includes("digistore") || platform.includes("ds24")) && pid) {
    return `https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all/detail/${encodeURIComponent(pid)}`;
  }

  return "";
}

function shadowCastAffiliateUrl(product) {
  const real = clean(product.affiliateLink);
  if (real) return real;

  // For products that still need vendor approval/promolink,
  // give ShadowCast a usable product-detail URL instead of leaving the required field blank.
  return digistore24DetailUrlForShadowCast(product);
}

export function shadowcastBaseUrl() {
  const base = process.env.SHADOWCAST_BASE_URL || "http://localhost:8000";
  return base.replace(/localhost/i, "127.0.0.1");
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
        p.id,
        p.platform,
        p.platformProductId,
        p.name,
        p.vendor,
        p.category,
        p.keywords,
        p.description,
        p.affiliateLink,
        p.hiddenGemScore,
        p.scoreComponents,
        p.commissionRate,
        p.conversionRate,
        p.cartValue,
        p.commissionType,
        p.saleCount,
        p.aggregateSales,
        p.refundCount,
        p.platformCreatedAt,
        l.affiliate_url AS linkedAffiliateUrl,
        l.status AS linkedAffiliateStatus
      FROM products p
      LEFT JOIN product_affiliate_links l
        ON l.id = (
          SELECT l2.id
          FROM product_affiliate_links l2
          WHERE l2.product_id = p.id
            AND l2.provider = p.platform
          ORDER BY
            CASE
              WHEN l2.status='approved' THEN 0
              WHEN l2.status='generated' THEN 1
              ELSE 2
            END,
            l2.updated_at DESC,
            l2.id DESC
          LIMIT 1
        )
      WHERE p.id=?
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
    const scoreObj = safeJsonParse(p.scoreComponents, {}) || {};
    const scoreMeta = scoreObj._meta || scoreObj.meta || {};
    const safeKeywords = normalizeKeywordList(p.keywords);
    const reviewBrief = b ? {
      review_summary: b.review_summary || "",
      positive_signals: toArray(parseJson(b.positive_signals, [])),
      negative_signals: toArray(parseJson(b.negative_signals, [])),
      common_claims: toArray(parseJson(b.common_claims, [])),
      common_complaints: toArray(parseJson(b.common_complaints, [])),
      target_audience: b.target_audience || "",
      who_it_may_help: b.who_it_may_help || "",
      who_should_skip_it: b.who_should_skip_it || "",
      best_video_angles: toArray(parseJson(b.best_video_angles, [])),
      cta_guidance: b.cta_guidance || "",
      recommended_content_style: b.recommended_content_style || "",
      suggested_competitors: toArray(parseJson(b.suggested_competitors, [])),
      price_display: b.price_display || "",
    } : null;
    const bestAffiliateUrl = clean(p.linkedAffiliateUrl) || clean(p.affiliateLink);
    const affiliateStatus = p.linkedAffiliateStatus || (bestAffiliateUrl ? "approved" : "needs_approval");
    const discountInfo = p.commissionRate ? `${p.commissionRate}% commission` : "";
    const keyFeatures = reviewBrief?.common_claims?.length
      ? reviewBrief.common_claims.slice(0, 5)
      : clean(p.description).split(/[,.;]/).map(x => x.trim()).filter(Boolean).slice(0, 5);
    const commonPraises = reviewBrief?.positive_signals || [];
    const commonComplaints = reviewBrief?.common_complaints || [];
    const suggestedCompetitors = reviewBrief?.suggested_competitors?.length
      ? reviewBrief.suggested_competitors
      : [];
    const recommendedStyle = reviewBrief?.recommended_content_style || "honest_review";
    const priceDisplay = reviewBrief?.price_display
      || (p.cartValue ? `$${Number(p.cartValue).toFixed(2)}` : "")
      || (p.aggregateSales && Number(p.aggregateSales) > 0
        ? `$${Number(p.aggregateSales).toFixed(2)} avg payout`
        : "Varies");
    const shadowcastImport = {
      product_name: p.name || "",
      niche: p.category || "",
      key_features: keyFeatures,
      affiliate_link: shadowCastAffiliateUrl({ ...p, affiliateLink: bestAffiliateUrl }),
      keywords: safeKeywords,
      product_category: p.category || p.platform || "",
      competitors: suggestedCompetitors,
      discount_info: discountInfo,
      unique_selling_point: reviewBrief?.review_summary || `Hidden Gem Score: ${Number(p.hiddenGemScore || 0).toFixed(1)}/100`,
      content_style: recommendedStyle,
      price: priceDisplay,
      target_audience: reviewBrief?.target_audience || "",
      common_complaints: commonComplaints,
      common_praises: commonPraises,
      who_not_for: reviewBrief?.who_should_skip_it || "",
    };

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
        keywords: safeKeywords,
        description: p.description || "",
        affiliate_url: shadowCastAffiliateUrl({ ...p, affiliateLink: bestAffiliateUrl }),
        affiliate_url_status: affiliateStatus,
        product_detail_url: digistore24DetailUrlForShadowCast(p),
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
      review_brief: reviewBrief,
      review_sources: sources,
      shadowcast_import: shadowcastImport,
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

  const data = await res.json();
  return {
    ...data,
    product: {
      id: payload.product.source_product_id,
      name: payload.product.name,
      enrichmentStatus: payload.review_enrichment.status,
    },
  };
}
