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

export const STALE_RUNNING_MINUTES = Number(process.env.REVIEW_ENRICHMENT_STALE_RUNNING_MIN || "30");

export async function reapStaleRunningJobs(conn, staleMinutes = STALE_RUNNING_MINUTES) {
  const minutes = Math.max(5, Math.floor(Number(staleMinutes) || STALE_RUNNING_MINUTES));
  const [result] = await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='queued', error_message=NULL, locked_at=NULL, updated_at=NOW()
    WHERE status='running'
      AND (
        locked_at IS NULL
        OR locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
      )
  `, [minutes]);
  return result.affectedRows || 0;
}

export async function reapExhaustedJobs(conn, staleDays = 7) {
  const days = Math.max(1, Math.floor(Number(staleDays) || 7));
  const [result] = await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='queued', attempts=0, next_run_at=NOW(), error_message=NULL, updated_at=NOW()
    WHERE status IN ('failed', 'queued')
      AND attempts >= 10
      AND updated_at < DATE_SUB(NOW(), INTERVAL ? DAY)
  `, [days]);
  return result.affectedRows || 0;
}

export async function queueReview(conn, productId) {
  if (!productId) return;
  const staleMin = Math.max(5, Math.floor(STALE_RUNNING_MINUTES));
  await conn.query(`
    INSERT INTO review_enrichment_jobs (product_id, status, next_run_at)
    VALUES (?, 'queued', NOW())
    ON DUPLICATE KEY UPDATE
      status = CASE
        WHEN status IN ('complete','failed','pending_api_key') THEN 'queued'
        WHEN status = 'running'
          AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)) THEN 'queued'
        ELSE status
      END,
      attempts = CASE
        WHEN status IN ('complete','failed','pending_api_key') THEN 0
        WHEN status = 'running'
          AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)) THEN 0
        ELSE attempts
      END,
      next_run_at = NOW(),
      error_message = CASE
        WHEN status IN ('complete','failed','pending_api_key') THEN NULL
        WHEN status = 'running'
          AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)) THEN NULL
        ELSE error_message
      END,
      locked_at = CASE
        WHEN status IN ('complete','failed','pending_api_key') THEN NULL
        WHEN status = 'running'
          AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)) THEN NULL
        ELSE locked_at
      END,
      updated_at = NOW()
  `, [productId, staleMin, staleMin, staleMin, staleMin]);
}

export async function ensureTableExists(conn, tableName) {
  const [rows] = await conn.query("SHOW TABLES LIKE ?", [tableName]);
  if (!rows?.length) {
    throw new Error(`${tableName} table missing — run: pnpm db:push`);
  }
}
