export const SERIES_NAMES = {
  worth_it_or_waste: "Worth It or Waste?",
  elimination: "Elimination Round",
  vs_battle: "VS Battle",
  budget_challenge: "Budget Challenge",
  honest_review: "Honest Review",
  standard: "Product Review",
};

const RETAILERS = new Set(["amazon.com", "walmart.com", "target.com", "bestbuy.com", "costco.com", "homedepot.com"]);
const REVIEW_SITES = new Set(["trustpilot.com", "sitejabber.com", "reddit.com"]);
const SCAM_ADVISORS = new Set(["scamadvisor.com", "scam-detector.com", "bbb.org"]);
const AFFILIATE_NOISE_HOSTS = new Set([
  "digistore24-app.com",
  "digistore24-static.com",
  "clickbank.com",
  "hop.clickbank.net",
  "jvzoo.com",
  "warriorplus.com",
  "paykickstart.com",
  "buygoods.com",
  "gurullc.com",
]);

const AFFILIATE_META_RE = /commission rate|earn commission|\d+%\s*commission|affiliates? are seeing|\bepc\b|average epcs?|promoting this|promote now|promote advanced|keyword.?bidding|keywords cannot include|compliance guidelines|dashboard\s+marketplace\s+analytics|skip to (?:main )?content|digistore24 promote|marketplace analytics sales|you will not get paid any commissions?|review legal (?:terms|notice)|privacy policy terms & conditions|jv\b|upsells? with \d+%\s*commission/i;
const SYNTHETIC_COMPETITOR_RE = /^(top|popular|budget)\s+.+\s+(alternative|competitor|option)$/i;

function matchesDomain(host, domains) {
  return [...domains].some(domain => host === domain || host.endsWith(`.${domain}`));
}

function quoted(value) {
  return `"${String(value || "").replace(/"/g, "").trim()}"`;
}

/** Shorten marketing titles for search queries only (keep full name for briefs). */
export function shortSearchProductName(name, maxLen = 40) {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;

  const beforeDelimiter = text.split(/\s+[–—|:]\s+|\s+-\s+/)[0].trim();
  if (beforeDelimiter.length >= 3 && beforeDelimiter.length <= maxLen) {
    return beforeDelimiter;
  }
  if (beforeDelimiter.length > maxLen) {
    const tokens = beforeDelimiter.split(/\s+/).filter(Boolean);
    let out = "";
    for (let i = 0; i < Math.min(5, tokens.length); i++) {
      const next = out ? `${out} ${tokens[i]}` : tokens[i];
      if (i >= 2 && next.length > maxLen) break;
      out = next;
    }
    return out.slice(0, maxLen).trim() || beforeDelimiter.slice(0, maxLen).trim();
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  let out = "";
  for (let i = 0; i < Math.min(5, tokens.length); i++) {
    const next = out ? `${out} ${tokens[i]}` : tokens[i];
    if (i >= 2 && next.length > maxLen) break;
    out = next;
  }
  return out.slice(0, maxLen).trim() || text.slice(0, maxLen).trim();
}

export function looksPhysicalRetailCategory(category) {
  return /\b(supplements?|vitamins?|capsules?|pills?|powder|cream|oil|device|gadget|apparel|clothing|shoes?|books?|print(?:ed)?|physical|retail|grocery|food|beauty|skincare|fitness.?gear)\b/i
    .test(String(category || ""));
}

export function classifySourceHost(host) {
  const normalized = String(host || "").toLowerCase().replace(/^www\./, "");
  if (matchesDomain(normalized, AFFILIATE_NOISE_HOSTS)) {
    return { source_type: "web", trust_boost: -30, tier: "affiliate_noise" };
  }
  if (matchesDomain(normalized, RETAILERS)) return { source_type: "retailer", trust_boost: 25, tier: "retailer" };
  if (matchesDomain(normalized, REVIEW_SITES)) return { source_type: "review", trust_boost: 20, tier: "review" };
  if (matchesDomain(normalized, SCAM_ADVISORS)) return { source_type: "scam_advisor", trust_boost: 30, tier: "scam_advisor" };
  if (matchesDomain(normalized, new Set(["youtube.com", "youtu.be"]))) {
    return { source_type: "web", trust_boost: 10, tier: "video" };
  }
  if (/clickbank|jvzoo|warriorplus|promolink|\bhop\.|affiliate|paykickstart|buygoods|cbengine|maxweb|everflow/.test(normalized)) {
    return { source_type: "web", trust_boost: -25, tier: "affiliate_noise" };
  }
  return { source_type: "web", trust_boost: 0, tier: "web" };
}

export function evidenceCoverageFromSources(sources = [], options = {}) {
  const by_type = {};
  const by_tier = {};
  let has_independent_review = false;
  let has_vendor_material = Boolean(options.has_vendor_material);

  for (const source of sources) {
    const host = (() => {
      try { return new URL(source.url || "").hostname.replace(/^www\./, ""); } catch { return source.source_name || ""; }
    })();
    const classified = classifySourceHost(host);
    const sourceType = source.source_type || classified.source_type;
    by_type[sourceType] = (by_type[sourceType] || 0) + 1;
    by_tier[classified.tier] = (by_tier[classified.tier] || 0) + 1;

    if (sourceType === "vendor" || classified.tier === "vendor") has_vendor_material = true;
    if (
      sourceType !== "vendor"
      && ["review", "scam_advisor", "video"].includes(classified.tier)
    ) {
      has_independent_review = true;
    }
  }

  return {
    source_count: sources.length,
    by_type,
    by_tier,
    has_retailer: Boolean(by_type.retailer),
    has_scam_advisor: Boolean(by_type.scam_advisor),
    has_independent_review,
    has_vendor_material,
    resolved_product_name: options.resolved_product_name || "",
  };
}

export function seriesNameForStyle(style) {
  return SERIES_NAMES[String(style || "").toLowerCase()] || SERIES_NAMES.honest_review;
}

export function digistoreEvidenceQueries(product = {}, options = {}) {
  const maxProduct = Math.max(1, Number(options.maxProduct ?? 8));
  const maxVendor = Math.max(0, Number(options.maxVendor ?? 4));
  const name = quoted(product.name);
  const vendor = product.vendor ? quoted(product.vendor) : "";
  const includeRetail = looksPhysicalRetailCategory(product.category);
  // Prefer high-signal review hosts first; retail sites only when category looks physical.
  const productQueries = [
    `site:trustpilot.com ${name}`,
    `site:reddit.com ${name}`,
    `site:youtube.com ${name} review`,
    `${name} review`,
    `${name} complaints`,
    `${name} scam`,
    `${name} refund`,
    `${name} price`,
    `site:sitejabber.com ${name}`,
    `site:bbb.org ${name}`,
    `site:scamadvisor.com ${name}`,
    `site:scam-detector.com ${name}`,
    `${name} worth it`,
    product.category && !/digistore24?\s*marketplace/i.test(String(product.category))
      ? `${name} ${quoted(product.category)} review`
      : "",
    ...(includeRetail
      ? [
        `site:amazon.com ${name}`,
        `site:walmart.com ${name}`,
        `site:target.com ${name}`,
        `site:bestbuy.com ${name}`,
      ]
      : []),
  ].filter(Boolean);
  const vendorQueries = vendor && vendor !== '""' ? [
    `site:bbb.org ${vendor}`,
    `site:trustpilot.com ${vendor}`,
    `${vendor} scam`,
    `${vendor} complaints`,
  ] : [];
  return [
    ...productQueries.slice(0, maxProduct),
    ...vendorQueries.slice(0, maxVendor),
  ];
}

export function digistoreVendorQueries(vendor, options = {}) {
  const max = Math.max(0, Number(options.max ?? 4));
  const raw = String(vendor || "").trim();
  if (!raw || /digistore24?/i.test(raw)) return [];
  const name = quoted(raw);
  if (name === '""') return [];
  return [
    `site:bbb.org ${name}`,
    `site:trustpilot.com ${name}`,
    `site:scamadvisor.com ${name}`,
    `site:scam-detector.com ${name}`,
    `site:sitejabber.com ${name}`,
    `${name} complaints`,
    `${name} scam`,
    `${name} reviews`,
  ].slice(0, max);
}

export function competitorEvidenceQueries(product = {}, options = {}) {
  const max = Math.max(1, Number(options.max ?? 5));
  const name = quoted(product.name);
  if (name === '""') return [];
  const category = String(product.category || "").trim();
  const queries = [
    `${name} vs`,
    `${name} alternative`,
    `best alternative to ${name}`,
    `${name} or`,
  ];
  if (category && !/digistore24?\s*marketplace/i.test(category)) {
    queries.push(`${quoted(category)} alternatives`);
  }
  return queries.slice(0, max);
}

function cleanCompetitorName(value) {
  return String(value || "")
    .replace(/[|•·].*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-:–—]+|[-:–—]+$/g, "")
    .slice(0, 80);
}

function isMarketplaceOrSyntheticCompetitor(name) {
  const text = cleanCompetitorName(name);
  if (!text) return true;
  if (/^(digistore24?|marketplace)$/i.test(text)) return true;
  if (SYNTHETIC_COMPETITOR_RE.test(text)) return true;
  if (/^(top|popular|budget)\b/i.test(text) && /\b(alternative|competitor|option)\b/i.test(text)) return true;
  return false;
}

function stripSubjectProduct(candidate, productName) {
  const subject = cleanCompetitorName(productName).toLowerCase();
  let text = cleanCompetitorName(candidate);
  if (!subject || !text) return text;
  const re = new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  text = text.replace(re, "").replace(/\s+/g, " ").trim();
  return text.replace(/^(vs|or|and|to|for|with)\s+/i, "").replace(/\s+(vs|or|and)$/i, "").trim();
}

function looksLikeProductPhrase(name) {
  const words = cleanCompetitorName(name).split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 6) return false;
  if (words.every(w => w.length <= 2)) return false;
  if (/^(best|top|alternatives?|review|reviews|scam|complaints?)$/i.test(name)) return false;
  return /[A-Za-z]/.test(name);
}

/** Extract competitor name phrases from a single title/snippet. */
export function extractCompetitorNamesFromText(text, product = {}) {
  const hay = String(text || "");
  const productName = String(product.name || "").trim();
  const found = [];

  const patterns = [
    /([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,5})\s+vs\.?\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,5})/g,
    /([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,5})\s+or\s+([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*){0,5})/g,
    /alternatives?\s+to\s+[^=:\-–—]+[=:\-–—]\s*([^.!?\n]+)/gi,
    /best\s+[^.!?\n]{0,40}?alternatives?\s*[:\-–—]?\s*([^.!?\n]+)/gi,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(hay)) !== null) {
      const chunks = match.slice(1).flatMap((part) => String(part || "").split(/,|\/|&|;|\band\b/i));
      for (const chunk of chunks) {
        const stripped = stripSubjectProduct(chunk, productName);
        if (looksLikeProductPhrase(stripped) && !isMarketplaceOrSyntheticCompetitor(stripped)) {
          found.push(cleanCompetitorName(stripped));
        }
      }
    }
  }

  return found;
}

export function extractCompetitorCandidatesFromHits(hits = [], product = {}, options = {}) {
  const vendor = String(product.vendor || options.vendor || "").trim().toLowerCase();
  const productName = String(product.name || "").trim().toLowerCase();
  const seen = new Set();
  const out = [];

  const push = (name, source_url = "") => {
    const cleaned = cleanCompetitorName(name);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return;
    if (vendor && key === vendor) return;
    if (productName && key === productName) return;
    if (isMarketplaceOrSyntheticCompetitor(cleaned)) return;
    if (!looksLikeProductPhrase(cleaned)) return;
    seen.add(key);
    out.push(source_url ? { name: cleaned, source_url } : { name: cleaned });
  };

  for (const hit of hits) {
    const hay = `${hit.title || ""} ${hit.snippet || ""}`;
    for (const name of extractCompetitorNamesFromText(hay, product)) {
      push(name, hit.url || "");
    }
  }

  for (const material of options.vendorMaterials || []) {
    const blocks = material?.structured_blocks || {};
    const compareText = [
      material?.title,
      material?.content_text,
      ...(blocks.objections || []),
      ...(blocks.benefits || []),
    ].filter(Boolean).join(" ");
    if (!/\b(vs\.?|versus|compare|alternative)/i.test(compareText)) continue;
    for (const name of extractCompetitorNamesFromText(compareText, product)) {
      push(name, material.source_url || "");
    }
  }

  for (const row of options.catalogMatches || []) {
    push(row.name || row, "");
  }

  return out.slice(0, 8);
}

export function normalizeSuggestedCompetitors(product, competitors, allowedCandidates = null) {
  const vendor = String(product.vendor || "").trim().toLowerCase();
  const productName = String(product.name || "").trim().toLowerCase();
  const allowed = Array.isArray(allowedCandidates) && allowedCandidates.length
    ? new Set(
      allowedCandidates
        .map((c) => cleanCompetitorName(typeof c === "string" ? c : c?.name).toLowerCase())
        .filter(Boolean),
    )
    : null;

  const cleaned = (Array.isArray(competitors) ? competitors : [])
    .map((c) => cleanCompetitorName(typeof c === "string" ? c : c?.name))
    .filter(Boolean)
    .filter((c) => !vendor || c.toLowerCase() !== vendor)
    .filter((c) => !productName || c.toLowerCase() !== productName)
    .filter((c) => !isMarketplaceOrSyntheticCompetitor(c))
    .filter((c) => !allowed || allowed.has(c.toLowerCase()));

  const deduped = [];
  const seen = new Set();
  for (const name of cleaned) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(name);
  }

  return deduped.slice(0, 4);
}

export function isAffiliateMetaSignal(value) {
  return AFFILIATE_META_RE.test(String(value || ""));
}

export function stripAffiliateMetaLines(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((x) => String(x || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((x) => !isAffiliateMetaSignal(x));
}

export function splitClaimAndReviewSources(sources = [], vendorDomains = new Set()) {
  const claimSources = [];
  const reviewSources = [];

  for (const source of sources) {
    const host = (() => {
      try { return new URL(source.url || "").hostname.replace(/^www\./, ""); } catch { return source.source_name || ""; }
    })();
    const classified = classifySourceHost(host);
    const isVendor = source.source_type === "vendor" || vendorDomains.has(host);

    if (isVendor) {
      claimSources.push(source);
      continue;
    }
    if (["review", "scam_advisor", "video"].includes(classified.tier)) {
      reviewSources.push(source);
    }
  }

  return { claimSources, reviewSources };
}

export function productNameTokenMatch(haystack, productName) {
  const hay = String(haystack || "").toLowerCase();
  const name = String(productName || "").toLowerCase().trim();
  if (!name || !hay) return false;
  if (hay.includes(name)) return true;
  const tokens = name.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits >= Math.min(2, tokens.length);
}
