import { classifySourceHost } from "./enrichment-source-trust.mjs";
import { ensureTableExists } from "./apf-db-helpers.mjs";

export async function ensureVendorProfilesTable(conn) {
  await ensureTableExists(conn, "vendor_profiles");
}

export function normalizeVendorName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function signalCount(value) {
  return Array.isArray(value) ? value.length : Number(value || 0);
}

export function scoreVendorFromSignals(signals = {}) {
  const trustpilot_positive = signalCount(signals.trustpilot_positive ?? signals.trustpilot);
  const bbb = signalCount(signals.bbb);
  const retailer = signalCount(signals.retailer);
  const scam_risk = signalCount(signals.scam_risk ?? signals.scam_advisor);
  const complaints = signalCount(signals.complaints ?? signals.complaint);
  const score = Math.max(0, Math.min(100,
    40 + Math.min(25, trustpilot_positive) + Math.min(15, bbb) + Math.min(10, retailer)
      - Math.min(40, scam_risk + complaints)
  ));
  return {
    score,
    band: score >= 70 ? "trusted" : score >= 40 ? "mixed" : "high_risk",
    components: { base: 40, trustpilot_positive, bbb, retailer, scam_risk, complaints },
  };
}

export function bucketVendorHits(hits = []) {
  const buckets = {
    bbb_signals: [],
    trustpilot_signals: [],
    scam_advisor_signals: [],
    review_signals: [],
    complaint_signals: [],
    retailer_signals: [],
  };
  for (const hit of hits) {
    const host = (() => {
      try { return new URL(hit.url || "").hostname; } catch { return hit.source_name || ""; }
    })();
    const classified = classifySourceHost(host);
    const text = `${hit.title || ""} ${hit.snippet || ""}`.toLowerCase();
    const sentiment = hit.sentiment || (/scam|complaint|warning|fraud|refund|rip.?off/.test(text)
      ? "negative"
      : /positive|recommended|legitimate|reliable|great/.test(text) ? "positive" : "unknown");
    const compact = { title: hit.title || "", url: hit.url || "", snippet: hit.snippet || "", sentiment };
    if (host.includes("bbb.org")) buckets.bbb_signals.push(compact);
    else if (classified.tier === "scam_advisor") buckets.scam_advisor_signals.push(compact);
    else if (host.includes("trustpilot.com")) buckets.trustpilot_signals.push(compact);
    else if (classified.source_type === "review") buckets.review_signals.push(compact);
    else if (classified.source_type === "retailer") buckets.retailer_signals.push(compact);
    if (/complaint|scam|warning|fraud|refund|rip.?off/.test(text)) buckets.complaint_signals.push(compact);
  }
  return buckets;
}

export async function upsertVendorProfile(conn, { platform, vendorName, hits = [] }) {
  const vendor_name_normalized = normalizeVendorName(vendorName);
  if (!vendor_name_normalized) return null;
  if (/^digistore24?$/.test(vendor_name_normalized)) return null;
  const buckets = bucketVendorHits(hits);
  const score = scoreVendorFromSignals({
    trustpilot_positive: buckets.trustpilot_signals.filter(signal => signal.sentiment === "positive"),
    bbb: buckets.bbb_signals,
    retailer: buckets.retailer_signals,
    scam_advisor: buckets.scam_advisor_signals,
    complaints: buckets.complaint_signals,
  });
  const vendor_risk_flags = [
    ...(buckets.scam_advisor_signals.length ? ["scam_advisor_results"] : []),
    ...(buckets.complaint_signals.length ? ["complaints_or_warnings"] : []),
  ];
  await conn.query(`
    INSERT INTO vendor_profiles
    (platform, vendor_name, vendor_name_normalized, bbb_signals, trustpilot_signals, scam_advisor_signals,
     review_signals, complaint_signals, source_count, vendor_trust_score, vendor_risk_flags, ranking_components,
     last_enriched_at, updated_at)
    VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON),
            ?, ?, CAST(? AS JSON), CAST(? AS JSON), NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      vendor_name=VALUES(vendor_name), bbb_signals=VALUES(bbb_signals), trustpilot_signals=VALUES(trustpilot_signals),
      scam_advisor_signals=VALUES(scam_advisor_signals), review_signals=VALUES(review_signals),
      complaint_signals=VALUES(complaint_signals), source_count=VALUES(source_count),
      vendor_trust_score=VALUES(vendor_trust_score), vendor_risk_flags=VALUES(vendor_risk_flags),
      ranking_components=VALUES(ranking_components), last_enriched_at=NOW(), updated_at=NOW()
  `, [
    platform, vendorName, vendor_name_normalized, JSON.stringify(buckets.bbb_signals),
    JSON.stringify(buckets.trustpilot_signals), JSON.stringify(buckets.scam_advisor_signals),
    JSON.stringify(buckets.review_signals), JSON.stringify(buckets.complaint_signals), hits.length,
    score.score, JSON.stringify(vendor_risk_flags), JSON.stringify({ ...score.components, band: score.band }),
  ]);
  return loadVendorProfile(conn, platform, vendorName);
}

export async function loadVendorProfile(conn, platform, vendorName) {
  const normalized = normalizeVendorName(vendorName);
  if (!normalized) return null;
  const [rows] = await conn.query(
    `SELECT * FROM vendor_profiles WHERE platform=? AND vendor_name_normalized=? LIMIT 1`,
    [platform, normalized]
  );
  return rows[0] || null;
}
