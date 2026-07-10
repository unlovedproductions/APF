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

function matchesDomain(host, domains) {
  return [...domains].some(domain => host === domain || host.endsWith(`.${domain}`));
}

export function classifySourceHost(host) {
  const normalized = String(host || "").toLowerCase().replace(/^www\./, "");
  if (matchesDomain(normalized, RETAILERS)) return { source_type: "retailer", trust_boost: 25, tier: "retailer" };
  if (matchesDomain(normalized, REVIEW_SITES)) return { source_type: "review", trust_boost: 20, tier: "review" };
  if (matchesDomain(normalized, SCAM_ADVISORS)) return { source_type: "scam_advisor", trust_boost: 30, tier: "scam_advisor" };
  if (matchesDomain(normalized, new Set(["youtube.com", "youtu.be"]))) return { source_type: "web", trust_boost: 10, tier: "video" };
  if (/clickbank|jvzoo|warriorplus|\bhop\.|affiliate/.test(normalized)) {
    return { source_type: "web", trust_boost: -25, tier: "affiliate_noise" };
  }
  return { source_type: "web", trust_boost: 0, tier: "web" };
}

export function evidenceCoverageFromSources(sources = []) {
  const by_type = {};
  const by_tier = {};
  for (const source of sources) {
    const host = (() => {
      try { return new URL(source.url || "").hostname; } catch { return source.source_name || ""; }
    })();
    const classified = classifySourceHost(host);
    const sourceType = source.source_type || classified.source_type;
    by_type[sourceType] = (by_type[sourceType] || 0) + 1;
    by_tier[classified.tier] = (by_tier[classified.tier] || 0) + 1;
  }
  return {
    source_count: sources.length,
    by_type,
    by_tier,
    has_retailer: Boolean(by_type.retailer),
    has_scam_advisor: Boolean(by_type.scam_advisor),
  };
}

export function seriesNameForStyle(style) {
  return SERIES_NAMES[String(style || "").toLowerCase()] || SERIES_NAMES.honest_review;
}

function quoted(value) {
  return `"${String(value || "").replace(/"/g, "").trim()}"`;
}

export function digistoreEvidenceQueries(product = {}) {
  const name = quoted(product.name);
  const vendor = product.vendor ? quoted(product.vendor) : "";
  const productQueries = [
    `site:trustpilot.com ${name}`,
    `site:amazon.com ${name}`,
    `site:walmart.com ${name}`,
    `site:target.com ${name}`,
    `site:bestbuy.com ${name}`,
    `site:reddit.com ${name}`,
    `site:bbb.org ${name}`,
    `site:scamadvisor.com ${name}`,
    `site:scam-detector.com ${name}`,
    `site:sitejabber.com ${name}`,
    `${name} review`,
    `${name} complaints`,
    `${name} scam`,
    `${name} price`,
    `${name} refund`,
    product.category ? `${name} ${quoted(product.category)} review` : "",
  ].filter(Boolean);
  const vendorQueries = vendor && vendor !== '""' ? [
    `site:bbb.org ${vendor}`,
    `site:trustpilot.com ${vendor}`,
    `${vendor} scam`,
    `${vendor} complaints`,
  ] : [];
  const productRoom = Math.max(0, 16 - vendorQueries.length);
  return [...productQueries.slice(0, productRoom), ...vendorQueries].slice(0, 16);
}

export function digistoreVendorQueries(vendor) {
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
  ];
}
