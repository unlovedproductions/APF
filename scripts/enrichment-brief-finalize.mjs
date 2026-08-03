import {
  evidenceCoverageFromSources,
  isAffiliateMetaSignal,
  isProbeTitleSignal,
  isVendorSalesCopy,
  normalizeSuggestedCompetitors,
  seriesNameForStyle,
  stripAffiliateMetaLines,
  substantiveReviewSources,
} from "./enrichment-source-trust.mjs";
import { sanitizeBuyerPrice } from "./digistore24-detail-extractor.mjs";

const CONTENT_STYLES = new Set([
  "honest_review",
  "elimination",
  "worth_it_or_waste",
  "budget_challenge",
  "vs_battle",
  "standard",
]);

export function briefText(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string" || typeof value === "number") {
    return String(value).replace(/\s+/g, " ").trim() || fallback;
  }
  if (Array.isArray(value)) {
    return value.map((v) => briefText(v)).filter(Boolean).join("; ") || fallback;
  }
  if (typeof value === "object") {
    const preferred = value.text ?? value.summary ?? value.value ?? value.label;
    if (preferred != null) return briefText(preferred, fallback);
  }
  return fallback;
}

/** Drop affiliate/compliance chrome and vendor sales prose from a narrative string. */
export function sanitizeNarrativeString(value, fallback = "", options = {}) {
  const text = briefText(value, "");
  if (!text) return fallback;
  if (isAffiliateMetaSignal(text) || isVendorSalesCopy(text)) return fallback;
  if (
    options.noIndependentReviews
    && options.strictThinEvidence
    && !/limited independent|verify (claims|the (current )?offer)|thin (public )?review|few public review/i.test(text)
  ) {
    return fallback;
  }
  return text;
}

export function derivePriceDisplay(product) {
  const cart = Number(product?.cartValue);
  if (Number.isFinite(cart) && cart > 0) return `$${cart.toFixed(2)}`;

  let components = product?.scoreComponents;
  if (typeof components === "string") {
    try { components = JSON.parse(components); } catch { components = {}; }
  }
  const meta = (components && typeof components === "object")
    ? (components._meta || components.meta || {})
    : {};
  if (meta.price) return String(meta.price);
  if (meta.apv) return `$${Number(meta.apv).toFixed(2)} avg payout`;

  return String(product?.platform || "").toLowerCase() === "digistore24"
    ? "See official offer page"
    : "Varies";
}

function inferContentStyleFromAngles(angles = []) {
  const blob = angles.join(" ").toLowerCase();
  if (/vs|versus|compared to|alternative/.test(blob)) return "vs_battle";
  if (/eliminat|cut|remove|round/.test(blob)) return "elimination";
  if (/budget|cheap|afford|price/.test(blob)) return "budget_challenge";
  if (/worth it|waste|buy or skip/.test(blob)) return "worth_it_or_waste";
  if (/honest|review|pros|cons/.test(blob)) return "honest_review";
  return "standard";
}

/**
 * Server-side coverage only. LLM evidence_coverage is ignored for gate booleans.
 */
export function serverEvidenceCoverage(sources = [], options = {}) {
  return evidenceCoverageFromSources(sources, {
    has_vendor_material: Boolean(options.hasVendorMaterial),
    resolved_product_name: options.resolvedProductName || "",
  });
}

/**
 * Finalize LLM/fallback brief with server gates that cannot be overridden by the model.
 */
export function finalizeBrief(product, brief, sources = [], options = {}) {
  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";
  const angles = (brief.best_video_angles || []).map((a) => briefText(a)).filter(Boolean);
  const inferredStyle = inferContentStyleFromAngles(angles);
  let recommended_content_style = CONTENT_STYLES.has(brief.recommended_content_style)
    ? brief.recommended_content_style
    : inferredStyle;

  const competitorCandidates = options.competitorCandidates || [];
  const suggested_competitors = normalizeSuggestedCompetitors(
    product,
    brief.suggested_competitors,
    competitorCandidates,
  );

  if (
    suggested_competitors.length < 2
    && (recommended_content_style === "vs_battle" || recommended_content_style === "elimination")
  ) {
    recommended_content_style = isDigistore ? "worth_it_or_waste" : "honest_review";
  }

  const coverage = serverEvidenceCoverage(sources, {
    hasVendorMaterial: options.hasVendorMaterial,
    resolvedProductName: product.name || "",
  });

  let confidence_score = Number(brief.confidence_score || 0) || Math.min(95, 50);
  if (options.identityUnresolved) {
    confidence_score = Math.min(confidence_score, 25);
    recommended_content_style = isDigistore ? "worth_it_or_waste" : "honest_review";
  } else if (!coverage.has_independent_review && !coverage.has_vendor_material) {
    confidence_score = Math.min(confidence_score, 40);
  } else if (!coverage.has_independent_review && isDigistore) {
    confidence_score = Math.min(confidence_score, 55);
  }
  if (options.searchSuspended) {
    confidence_score = Math.min(confidence_score, 40);
  }

  const reviewSources = options.reviewSources;
  const noIndependentReviews = Array.isArray(reviewSources) && reviewSources.length === 0;
  // Probe-only / empty-content review URLs must not invent praises/complaints from titles.
  const thinIndependentEvidence = Array.isArray(reviewSources)
    && substantiveReviewSources(reviewSources).length === 0;
  const blockPraiseComplaint = noIndependentReviews || thinIndependentEvidence;

  let positive_signals = stripAffiliateMetaLines(
    (brief.positive_signals || []).map((x) => briefText(x)).filter(Boolean),
  ).filter((x) => !isProbeTitleSignal(x));
  let common_complaints = stripAffiliateMetaLines(
    (brief.common_complaints || []).map((x) => briefText(x)).filter(Boolean),
  ).filter((x) => !isProbeTitleSignal(x));
  const common_claims = stripAffiliateMetaLines(
    (brief.common_claims || []).map((x) => briefText(x)).filter(Boolean),
  );
  const negative_signals = stripAffiliateMetaLines(
    (brief.negative_signals || []).map((x) => briefText(x)).filter(Boolean),
  ).filter((x) => !isProbeTitleSignal(x));

  if (blockPraiseComplaint) {
    positive_signals = [];
    common_complaints = [];
  }

  const defaultSummary = isDigistore
    ? `${product.name} has limited independent public review evidence. Verify claims on the official offer page before buying.`
    : `${product.name} has ${sources.length} discovered public review/search signals. Present this as a trust-first review and avoid unsupported claims.`;

  const review_summary = sanitizeNarrativeString(brief.review_summary, defaultSummary, {
    noIndependentReviews: blockPraiseComplaint,
    strictThinEvidence: isDigistore && blockPraiseComplaint,
  });

  return {
    ...brief,
    review_summary,
    positive_signals,
    negative_signals,
    common_claims,
    common_complaints,
    target_audience: sanitizeNarrativeString(
      brief.target_audience,
      `People researching ${product.name} before buying.`,
    ),
    who_it_may_help: sanitizeNarrativeString(
      brief.who_it_may_help,
      `People comparing options in ${product.category || "this category"}.`,
    ),
    who_should_skip_it: sanitizeNarrativeString(
      brief.who_should_skip_it,
      "People expecting guaranteed results or anyone who should consult a professional before using the product.",
    ),
    best_video_angles: (() => {
      const cleaned = angles.filter((a) => !isAffiliateMetaSignal(a) && !isVendorSalesCopy(a));
      return cleaned.length
        ? cleaned
        : ["What problem does this solve for buyers?", "What to verify before buying"];
    })(),
    cta_guidance: sanitizeNarrativeString(
      brief.cta_guidance,
      "Check the official offer page for current price and refund terms.",
    ),
    recommended_content_style,
    suggested_competitors,
    price_display: sanitizeBuyerPrice(
      brief.price_display || derivePriceDisplay(product),
      product.cartValue,
    ),
    price_comparison: sanitizeNarrativeString(
      brief.price_comparison,
      `Compare the current ${derivePriceDisplay(product)} offer against 2-3 category alternatives before buying.`,
    ),
    series_name: seriesNameForStyle(recommended_content_style),
    coupon_code: "",
    evidence_coverage: coverage,
    confidence_score,
  };
}

export function shouldForceDegraded(options = {}, coverage = {}) {
  const noReviewSources = Array.isArray(options.reviewSources)
    && options.reviewSources.length === 0;
  const thinIndependentEvidence = Array.isArray(options.reviewSources)
    && substantiveReviewSources(options.reviewSources).length === 0;
  return Boolean(
    options.identityUnresolved
    || options.degraded
    || options.searchSuspended
    || noReviewSources
    || thinIndependentEvidence
    || (!coverage.has_independent_review && !coverage.has_vendor_material),
  );
}

/** Redact secrets and truncate provider bodies before persisting job errors. */
export function sanitizeJobErrorMessage(err, limit = 500) {
  let msg = String(err?.message || err || "unknown error").replace(/\s+/g, " ").trim();
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
  msg = msg.replace(/api[_-]?key[=:\s]+\S+/gi, "api_key=[redacted]");
  msg = msg.replace(/DATABASE_URL[=:\s]+\S+/gi, "DATABASE_URL=[redacted]");
  msg = msg.replace(/sk-[A-Za-z0-9]{10,}/g, "[redacted]");
  // Drop trailing JSON/HTML response bodies after status text.
  msg = msg.replace(/:\s*\{.*$/u, "");
  msg = msg.replace(/:\s*<[!a-zA-Z].*$/u, "");
  if (msg.length > limit) return `${msg.slice(0, limit)}…`;
  return msg || "unknown error";
}
