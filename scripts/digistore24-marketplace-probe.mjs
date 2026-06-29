#!/usr/bin/env node
import fs from "node:fs";

function loadEnv(file = ".env") {
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

loadEnv();

const base = (process.env.DIGISTORE24_API_BASE_URL || "https://www.digistore24.com/api/call").replace(/\/+$/, "");
const key = process.env.DIGISTORE24_API_KEY;

if (!key) {
  console.error("DIGISTORE24_API_KEY missing from .env");
  process.exit(1);
}

const candidates = [
  "listMarketplaceEntries",
  "listMarketplaceEntries?limit=10",
  "listMarketplaceEntries?count=10",
  "listMarketplaceEntries?per_page=10",
  "listMarketplaceEntries?page_size=10",
  "listMarketplaceEntries?rows=10",
  "listMarketplaceEntries?page=1",
  "listMarketplaceEntries?offset=0",
  "listMarketplaceEntries?language=en&limit=10",
  "listMarketplaceEntries?language=de&limit=10",
  "listMarketplaceEntries?language=en&count=10",
  "listMarketplaceEntries?language=de&count=10",
  "listMarketplaceEntries?currency=USD&limit=10",
  "listMarketplaceEntries?currency=EUR&limit=10",
  "listMarketplaceEntries?reseller_id=2&limit=10",
  "listMarketplaceEntries?reseller_id=1&limit=10",
  "listMarketplaceEntries?sort=popularity&limit=10",
  "listMarketplaceEntries?sort=cart_conversion&limit=10",
  "listMarketplaceEntries?sort=earnings_per_sale&limit=10",
  "listMarketplaceEntries?search=health&limit=10",
  "listMarketplaceEntries?search_text=health&limit=10",
  "listMarketplaceEntries?q=health&limit=10",
  "listMarketplaceEntries?query=health&limit=10",
  "listMarketplaceEntries?search=fitness&limit=10",
  "listMarketplaceEntries?search_text=fitness&limit=10",
  "listMarketplaceEntries?q=fitness&limit=10",
  "listMarketplaceEntries?query=fitness&limit=10",
  "listMarketplaceEntries?search=software&limit=10",
  "listMarketplaceEntries?search_text=software&limit=10",
  "listMarketplaceEntries?q=software&limit=10",
  "listMarketplaceEntries?query=software&limit=10",
  "listMarketplaceEntries?auto_approve=1&limit=10",
  "listMarketplaceEntries?automatic_approval=1&limit=10",
  "listMarketplaceEntries?affiliate_approval=auto&limit=10"
];

function findEntries(data) {
  if (!data || typeof data !== "object") return [];

  if (Array.isArray(data.entries)) return data.entries;
  if (Array.isArray(data.marketplace_entries)) return data.marketplace_entries;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.products)) return data.products;

  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = findEntries(value);
      if (nested.length) return nested;
    }
  }

  return [];
}

async function call(endpoint) {
  const url = `${base}/${endpoint}`;

  const res = await fetch(url, {
    headers: {
      "X-DS-API-KEY": key,
      "Accept": "application/json"
    }
  });

  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return {
      endpoint,
      http_status: res.status,
      json: false,
      text_sample: text.slice(0, 500)
    };
  }

  const entries = findEntries(json.data || {});
  const count =
    json.data?.count ??
    json.data?.total ??
    json.data?.total_count ??
    entries.length;

  return {
    endpoint,
    http_status: res.status,
    result: json.result,
    message: json.message || "",
    code: json.code || "",
    count,
    entry_count_detected: entries.length,
    data_keys: json.data && typeof json.data === "object" ? Object.keys(json.data) : [],
    first_entry: entries[0] || null,
    raw: json
  };
}

fs.mkdirSync("exports", { recursive: true });

const results = [];

for (const endpoint of candidates) {
  const result = await call(endpoint);
  results.push(result);

  console.log({
    endpoint: result.endpoint,
    http_status: result.http_status,
    result: result.result,
    message: result.message,
    code: result.code,
    count: result.count,
    entry_count_detected: result.entry_count_detected,
    data_keys: result.data_keys
  });

  if (result.entry_count_detected > 0) {
    console.log("");
    console.log("FOUND ENTRIES with:");
    console.log(endpoint);
    console.log("");
    console.dir(result.first_entry, { depth: 4 });
    console.log("");
  }
}

fs.writeFileSync("exports/digistore24_marketplace_probe.json", JSON.stringify(results, null, 2));

const working = results.filter(r => r.entry_count_detected > 0);

console.log("");
console.log("Probe complete.");
console.log("Working endpoint variants:", working.map(r => r.endpoint));
console.log("Full output: exports/digistore24_marketplace_probe.json");

if (!working.length) {
  console.log("");
  console.log("No marketplace entries returned from tested API variants.");
  console.log("That likely means Digistore24 requires marketplace selection/promolink approval through the logged-in affiliate UI for this account/API key.");
}
