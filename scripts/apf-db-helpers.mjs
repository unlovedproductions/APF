export function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeKeywordList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
  if (typeof raw === "string") {
    const parsed = safeJsonParse(raw, null);
    if (Array.isArray(parsed)) {
      return parsed.map(v => String(v).trim()).filter(Boolean);
    }
    return raw.split(",").map(v => v.trim()).filter(Boolean);
  }
  return [];
}

export async function upsertAffiliateLink(conn, {
  productId,
  provider = "digistore24",
  affiliateNickname,
  vendorNickname = "",
  platformProductId = "",
  affiliateUrl = "",
  campaignKey = "",
  status = "generated",
  notes = "",
}) {
  if (!productId || !affiliateNickname || !affiliateUrl) return;

  await conn.query(`
    INSERT INTO product_affiliate_links (
      product_id, provider, affiliate_nickname, vendor_nickname, platform_product_id,
      affiliate_url, campaign_key, status, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      vendor_nickname=VALUES(vendor_nickname),
      platform_product_id=VALUES(platform_product_id),
      affiliate_url=VALUES(affiliate_url),
      campaign_key=VALUES(campaign_key),
      status=VALUES(status),
      notes=VALUES(notes),
      updated_at=NOW()
  `, [
    productId,
    provider,
    affiliateNickname,
    vendorNickname,
    platformProductId,
    affiliateUrl,
    campaignKey,
    status,
    notes,
  ]);
}

export async function queueReview(conn, productId) {
  if (!productId) return;
  await conn.query(`
    INSERT INTO review_enrichment_jobs (product_id, status, next_run_at)
    VALUES (?, 'queued', NOW())
    ON DUPLICATE KEY UPDATE
      status = CASE
        WHEN status IN ('complete','failed','pending_api_key') THEN 'queued'
        ELSE status
      END,
      next_run_at = NOW(),
      updated_at = NOW()
  `, [productId]);
}
