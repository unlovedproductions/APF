export const SCORING_VERSION = "apf_marketplace_router_v2_native_components";
export const PROMOTE_CALIBRATION_MIN_RESULTS = 3;

function clamp(n, min = 0, max = 100) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function parseJson(v, fallback = {}) {
  if (!v) return fallback;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function sumComponents(c) {
  return Math.round(
    clamp(Number(c.recency || 0), 0, 20) +
    clamp(Number(c.growth || 0), 0, 30) +
    clamp(Number(c.competition || 0), 0, 10) +
    clamp(Number(c.quality || 0), 0, 40)
  );
}

function numberFromText(text, patterns) {
  const s = clean(text);
  for (const pattern of patterns) {
    const m = s.match(pattern);
    if (m) {
      const n = Number(String(m[1]).replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function hasAffiliateLink(product) {
  const url = clean(
    product.affiliateLink ||
    product.affiliate_url ||
    product.affiliateUrl ||
    product.generated_affiliate_url
  );

  const status = clean(product.link_status).toLowerCase();

  return (
    /approved|generated/.test(status) ||
    /checkout-ds24\.com\/redir|#aff=|[?&]aff=/.test(url)
  );
}

export function scoreClickBank(product, options = {}) {
  const previous = parseJson(product.scoreComponents, {});
  const existingScore = Number(product.hiddenGemScore);

  const looksNative =
    previous &&
    Object.prototype.hasOwnProperty.call(previous, "recency") &&
    Object.prototype.hasOwnProperty.call(previous, "growth") &&
    Object.prototype.hasOwnProperty.call(previous, "competition") &&
    Object.prototype.hasOwnProperty.call(previous, "quality");

  if (!options.forceClickBank && Number.isFinite(existingScore) && existingScore > 0 && looksNative) {
    return {
      score: Math.round(clamp(existingScore)),
      strategy: "clickbank_native_passthrough",
      marketplace: "clickbank",
      components: {
        recency: clamp(previous.recency, 0, 20),
        growth: clamp(previous.growth, 0, 30),
        competition: clamp(previous.competition, 0, 10),
        quality: clamp(previous.quality, 0, 40)
      },
      meta: {
        note: "Preserved existing APF ClickBank native score components."
      }
    };
  }

  const apv = Number(product.aggregateSales || 0);
  const epc = Number(product.commissionRate || 0);
  const description = clean(product.description);
  const affiliateLink = clean(product.affiliateLink);

  const recency = 20;

  const growth =
    epc >= 4 || apv >= 180 ? 30 :
    epc >= 2 || apv >= 120 ? 24 :
    epc >= 0.75 || apv >= 50 ? 18 :
    12;

  const competition = 8;

  const quality = clamp(
    (affiliateLink ? 10 : 0) +
    (description.length > 300 ? 12 : description.length > 80 ? 8 : 3) +
    (apv >= 100 ? 8 : apv > 0 ? 5 : 0) +
    (epc >= 2 ? 10 : epc > 0 ? 5 : 0),
    0,
    40
  );

  const components = { recency, growth, competition, quality };

  return {
    score: sumComponents(components),
    strategy: "clickbank_native_fallback",
    marketplace: "clickbank",
    components,
    meta: {
      note: "Fallback ClickBank scorer used because native components were missing."
    }
  };
}

export function isCampaignPromoteResult(row = {}) {
  const event = clean(row?.event);
  if (event !== "promote_result") return false;
  const notes = clean(row?.notes);
  // Listing/marketplace EPC seeds are not campaign outcomes.
  if (/^listing_signal\b/i.test(notes)) return false;
  return true;
}

export function summarizePromoteResults(outcomes = []) {
  const rows = (outcomes || []).filter((o) => isCampaignPromoteResult(o));
  const epcs = rows
    .map((r) => Number(r.net_epc ?? r.netEpc))
    .filter((n) => Number.isFinite(n));
  const refunds = rows
    .map((r) => Number(r.refund_rate ?? r.refundRate))
    .filter((n) => Number.isFinite(n));
  return {
    n: rows.length,
    avg_epc: epcs.length ? epcs.reduce((a, b) => a + b, 0) / epcs.length : null,
    avg_refund_rate: refunds.length
      ? refunds.reduce((a, b) => a + b, 0) / refunds.length
      : null,
  };
}

/**
 * Optional post-score calibration from labeled promote_result rows.
 * Gated until PROMOTE_CALIBRATION_MIN_RESULTS exist for the product.
 */
export function applyPromoteOutcomeCalibration(result, outcomes = [], options = {}) {
  const min = Number(options.minResults ?? PROMOTE_CALIBRATION_MIN_RESULTS) || PROMOTE_CALIBRATION_MIN_RESULTS;
  const summary = summarizePromoteResults(outcomes);
  const next = {
    ...result,
    components: { ...(result?.components || {}) },
    meta: { ...(result?.meta || {}) },
  };
  if (summary.n < min) {
    next.meta.promote_calibration = {
      applied: false,
      reason: "insufficient_rows",
      min,
      ...summary,
    };
    return next;
  }

  let growth = Number(next.components.growth || 0);
  let quality = Number(next.components.quality || 0);
  const adjustments = {};

  if (summary.avg_epc != null) {
    const delta =
      summary.avg_epc >= 2 ? 4 :
      summary.avg_epc >= 1 ? 2 :
      summary.avg_epc >= 0.5 ? 0 :
      -4;
    growth = clamp(growth + delta, 0, 30);
    adjustments.growth_delta = delta;
  }

  if (summary.avg_refund_rate != null) {
    const delta =
      summary.avg_refund_rate < 5 ? 2 :
      summary.avg_refund_rate < 10 ? 0 :
      summary.avg_refund_rate < 20 ? -3 :
      -6;
    quality = clamp(quality + delta, 0, 40);
    adjustments.quality_delta = delta;
  }

  next.components.growth = growth;
  next.components.quality = quality;
  next.score = sumComponents(next.components);
  next.strategy = `${clean(result?.strategy) || "scored"}+promote_cal`;
  next.meta.promote_calibration = {
    applied: true,
    min,
    ...summary,
    adjustments,
  };
  return next;
}

export function scoreDigistore24(product, options = {}) {
  const previous = parseJson(product.scoreComponents, {});
  const meta = previous?._meta || previous?.meta || {};
  const fallbackText = clean(product.description);

  const commissionPercent =
    Number(product.commissionRate || 0) > 0
      ? Number(product.commissionRate)
      : (Number(meta.detected_commission_rate || 0) > 0
        ? Number(meta.detected_commission_rate)
        : numberFromText(fallbackText, [
          /commission[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i,
          /(\d+(?:\.\d+)?)\s*%\s*commission/i,
          /affiliate[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i
        ]));

  const conversionPercent =
    Number(product.conversionRate || 0) > 0
      ? Number(product.conversionRate)
      : (Number(meta.detected_conversion_rate || 0) > 0
        ? Number(meta.detected_conversion_rate)
        : numberFromText(fallbackText, [
          /conversion[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i,
          /cart\s*conversion[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i,
          /(\d+(?:\.\d+)?)\s*%\s*conversion/i
        ]));

  const earningsValue =
    Number(product.cartValue || 0) > 0
      ? Number(product.cartValue)
      : (Number(meta.detected_cart_value || meta.detected_earnings_value || 0) > 0
        ? Number(meta.detected_cart_value || meta.detected_earnings_value)
        : numberFromText(fallbackText, [
    /earnings[^0-9$€]{0,20}[$€]?(\d+(?:\.\d+)?)/i,
    /epc[^0-9$€]{0,20}[$€]?(\d+(?:\.\d+)?)/i,
    /cart\s*value[^0-9$€]{0,20}[$€]?(\d+(?:\.\d+)?)/i,
    /average\s*payout[^0-9$€]{0,20}[$€]?(\d+(?:\.\d+)?)/i
        ]));

  const refundRateRaw =
    Number(product.refundRate) > 0
      ? Number(product.refundRate)
      : (Number(meta.detected_refund_rate) > 0
        ? Number(meta.detected_refund_rate)
        : numberFromText(fallbackText, [
          /refund(?:\s*rate)?[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i,
          /cancellation(?:\s*rate)?[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i,
          /cancel(?:lation)?\s*rate[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i,
        ]));
  const refundRate = Number.isFinite(Number(refundRateRaw)) ? Number(refundRateRaw) : null;

  const sourceCount = Number(product.source_count || 0);
  const confidence = Number(product.confidence_score || 0);

  // APF-native component 1: recency, max 20.
  // Digistore24 imports are fresh if they were just collected or refreshed.
  const recency = 20;

  // APF-native component 2: growth, max 30.
  // Uses visible Digistore24-style demand/earning signals.
  let growth = 12;

  if (commissionPercent !== null) {
    growth += commissionPercent >= 50 ? 8 : commissionPercent >= 30 ? 6 : commissionPercent >= 15 ? 4 : 2;
  } else {
    growth += 3;
  }

  if (conversionPercent !== null) {
    growth += conversionPercent >= 5 ? 8 : conversionPercent >= 2 ? 6 : conversionPercent >= 1 ? 4 : 2;
  } else {
    growth += 3;
  }

  if (earningsValue !== null) {
    growth += earningsValue >= 50 ? 6 : earningsValue >= 20 ? 4 : earningsValue >= 5 ? 2 : 1;
  } else {
    growth += 2;
  }

  growth = clamp(growth, 0, 30);

  // APF-native component 3: competition, max 10.
  // Lower review/search saturation is better.
  const competition =
    sourceCount === 0 ? 8 :
    sourceCount <= 5 ? 10 :
    sourceCount <= 20 ? 8 :
    sourceCount <= 50 ? 5 :
    3;

  // APF-native component 4: quality, max 40.
  // Affiliate readiness + product details + evidence presence + refund risk.
  // Do NOT use enrichment confidence_score (circular / confidence theater).
  const nameOk = Boolean(clean(product.name)) && !/^(digistore24?|marketplace)$/i.test(clean(product.name));
  let quality = clamp(
    (hasAffiliateLink(product) ? 14 : 4) +
    (clean(product.platformProductId).match(/^\d+$/) ? 5 : 2) +
    (nameOk ? 4 : 0) +
    (clean(product.category) ? 3 : 0) +
    (clean(product.description).length > 300 ? 7 : clean(product.description).length > 80 ? 5 : 2) +
    (sourceCount >= 5 ? 5 : sourceCount > 0 ? 3 : 0) +
    (refundRate === null ? 0 : refundRate < 5 ? 4 : refundRate < 10 ? 2 : refundRate < 20 ? -3 : -8),
    0,
    40
  );
  const vendorTrustScore = Number(product.vendor_trust_score);
  const vendorRankBand = Number.isFinite(vendorTrustScore)
    ? (vendorTrustScore >= 70 ? "trusted" : vendorTrustScore >= 40 ? "mixed" : "high_risk")
    : null;
  if (Number.isFinite(vendorTrustScore)) {
    quality = clamp(quality + (vendorTrustScore >= 70 ? 5 : vendorTrustScore >= 40 ? 2 : -5), 0, 40);
  }

  const components = { recency, growth, competition, quality };

  const result = {
    score: sumComponents(components),
    strategy: "digistore24_native_v2",
    marketplace: "digistore24",
    components,
    meta: {
      detected_commission_percent: commissionPercent,
      detected_conversion_percent: conversionPercent,
      detected_earnings_value: earningsValue,
      detected_refund_rate: refundRate,
      review_source_count: sourceCount,
      review_confidence: Number.isFinite(confidence) ? confidence : null,
      review_confidence_in_score: false,
      vendor_trust_score: Number.isFinite(vendorTrustScore) ? vendorTrustScore : null,
      vendor_rank_band: vendorRankBand,
      affiliate_ready: hasAffiliateLink(product),
      note: "digistore24_native_v2: refund/cancel rate in quality; enrichment confidence excluded from score.",
    }
  };

  const outcomes = options.promoteOutcomes || product.promoteOutcomes || [];
  if (Array.isArray(outcomes) && outcomes.length > 0) {
    return applyPromoteOutcomeCalibration(result, outcomes, options);
  }
  return result;
}

export function scoreGeneric(product) {
  const sourceCount = Number(product.source_count || 0);
  const confidence = Number(product.confidence_score || 0);

  const components = {
    recency: 15,
    growth: hasAffiliateLink(product) ? 18 : 10,
    competition: sourceCount <= 10 ? 8 : 5,
    quality: clamp(
      (clean(product.name) ? 8 : 0) +
      (clean(product.description).length > 80 ? 10 : 4) +
      (hasAffiliateLink(product) ? 12 : 4) +
      (confidence >= 60 ? 10 : sourceCount > 0 ? 5 : 0),
      0,
      40
    )
  };

  return {
    score: sumComponents(components),
    strategy: "generic_native_v1",
    marketplace: clean(product.platform || "unknown"),
    components,
    meta: {
      note: "Generic APF-native fallback scorer."
    }
  };
}

export function scoreProduct(product, options = {}) {
  const platform = clean(product.platform).toLowerCase();

  if (platform.includes("digistore") || platform.includes("ds24")) {
    return scoreDigistore24(product, options);
  }

  if (platform.includes("clickbank")) {
    return scoreClickBank(product, options);
  }

  return scoreGeneric(product, options);
}
