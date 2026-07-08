function clean(value, limit = 10000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function parsePercent(text, hints = []) {
  const source = clean(text, 20000);
  for (const hint of hints) {
    const re = new RegExp(`${hint}[^\\d]{0,30}(\\d+(?:\\.\\d+)?)\\s*%`, "i");
    const match = source.match(re);
    if (match) return Number(match[1]);
  }
  const generic = source.match(/(\d+(?:\.\d+)?)\s*%\s*(?:commission|conversion)/i);
  return generic ? Number(generic[1]) : null;
}

function parseCurrency(text, hints = []) {
  const source = clean(text, 20000);
  for (const hint of hints) {
    const re = new RegExp(`${hint}[^\\d$€£]{0,30}[$€£]?\\s*(\\d{1,6}(?:[\\.,]\\d{1,2})?)`, "i");
    const match = source.match(re);
    if (match) return Number(match[1].replace(",", "."));
  }
  const generic = source.match(/[$€£]\s*(\d{1,6}(?:[\.,]\d{1,2})?)/);
  return generic ? Number(generic[1].replace(",", ".")) : null;
}

function parseDate(text, hints = []) {
  const source = clean(text, 20000);
  for (const hint of hints) {
    const re = new RegExp(`${hint}[^\\da-zA-Z]{0,20}([\\d]{1,2}[./-][\\d]{1,2}[./-][\\d]{2,4}|[A-Za-z]{3,10}\\s+\\d{1,2},?\\s+\\d{2,4})`, "i");
    const match = source.match(re);
    if (match) {
      const parsed = new Date(match[1]);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return null;
}

function parseFieldByLabel(lines, labels = []) {
  for (const line of lines) {
    const normalized = clean(line, 500);
    for (const label of labels) {
      const re = new RegExp(`^${label}\\s*[:|-]?\\s*(.+)$`, "i");
      const match = normalized.match(re);
      if (match) return clean(match[1], 255);
    }
  }
  return "";
}

export function extractDigistore24Detail(raw) {
  const title = clean(raw.title, 255);
  const body = clean(raw.body, 12000);
  const lines = body.split(/\n+/).map(line => clean(line, 500)).filter(Boolean);
  const importantSections = lines
    .filter(line => /vendor|seller|creator|category|niche|topic|commission|price|cart value|conversion|created|listed/i.test(line))
    .join(" | ");
  const description = clean((raw.descriptionSection || body).slice(0, 3500), 3500);
  const vendor = parseFieldByLabel(lines, ["vendor", "seller", "creator"]) || "digistore24";
  const category = parseFieldByLabel(lines, ["category", "niche", "topic"]) || "Digistore24 Marketplace";
  const commissionRate = parsePercent(`${importantSections} ${body}`, ["commission", "affiliate"]);
  const conversionRate = parsePercent(`${importantSections} ${body}`, ["conversion", "cart conversion"]);
  const cartValue = parseCurrency(`${importantSections} ${body}`, ["cart value", "price", "payout", "earnings", "epc"]);
  const platformCreatedAt = parseDate(`${importantSections} ${body}`, ["created", "listed", "published"]);

  return {
    title,
    vendor,
    category,
    description,
    commissionRate,
    conversionRate,
    cartValue,
    platformCreatedAt,
    detectedMeta: {
      detected_vendor: vendor || null,
      detected_category: category || null,
      detected_commission_rate: commissionRate,
      detected_conversion_rate: conversionRate,
      detected_cart_value: cartValue,
      detected_platform_created_at: platformCreatedAt,
    },
  };
}
