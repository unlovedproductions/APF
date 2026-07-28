/** Coerce messy LLM JSON into brief-shaped primitives before Zod. */

export function flattenBriefValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).replace(/\s+/g, " ").trim();
  }
  if (Array.isArray(value)) {
    return value.map(flattenBriefValue).filter(Boolean).join("; ");
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") return flattenBriefValue(value.text);
    if (typeof value.value === "string") return flattenBriefValue(value.value);
    if (typeof value.name === "string" && Object.keys(value).length <= 3) {
      return flattenBriefValue(value.name);
    }
    return Object.values(value).map(flattenBriefValue).filter(Boolean).join("; ");
  }
  return String(value).replace(/\s+/g, " ").trim();
}

function coerceStringArray(value) {
  if (value == null) return undefined;
  if (!Array.isArray(value)) {
    const single = flattenBriefValue(value);
    return single ? [single] : [];
  }
  return value.map(flattenBriefValue).filter(Boolean);
}

function coerceCompetitors(value) {
  if (value == null) return undefined;
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") return flattenBriefValue(item);
      if (item && typeof item === "object") return flattenBriefValue(item.name || item.title || item);
      return "";
    })
    .filter(Boolean);
}

const STRING_FIELDS = [
  "review_summary",
  "target_audience",
  "who_it_may_help",
  "who_should_skip_it",
  "cta_guidance",
  "price_display",
  "price_comparison",
  "series_name",
  "coupon_code",
  "recommended_content_style",
];

const ARRAY_FIELDS = [
  "positive_signals",
  "negative_signals",
  "common_claims",
  "common_complaints",
  "best_video_angles",
];

/**
 * Normalize LLM brief payloads so Zod string/array fields accept objects.
 * Returns a shallow-copied object; does not mutate input.
 */
export function coerceLlmBriefPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const out = { ...raw };

  for (const key of STRING_FIELDS) {
    if (key in out && out[key] != null && typeof out[key] !== "string") {
      out[key] = flattenBriefValue(out[key]);
    }
  }

  for (const key of ARRAY_FIELDS) {
    if (key in out) {
      out[key] = coerceStringArray(out[key]);
    }
  }

  if ("suggested_competitors" in out) {
    out.suggested_competitors = coerceCompetitors(out.suggested_competitors);
  }

  if ("confidence_score" in out && typeof out.confidence_score === "string") {
    const n = Number(out.confidence_score);
    if (Number.isFinite(n)) out.confidence_score = n;
  }

  if (out.evidence_coverage != null && typeof out.evidence_coverage !== "object") {
    out.evidence_coverage = { note: flattenBriefValue(out.evidence_coverage) };
  }

  return out;
}
