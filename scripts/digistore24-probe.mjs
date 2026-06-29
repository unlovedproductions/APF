#!/usr/bin/env node
import fs from "node:fs";

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
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

const calls = [
  "getUserInfo",
  "getGlobalSettings",
  "listMarketplaceEntries",
  "listMarketplaceEntries?language=en",
  "listMarketplaceEntries?language=de",
  "listProducts",
  "listProductTypes",
  "statsMarketplace"
];

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

  return {
    endpoint,
    http_status: res.status,
    result: json.result,
    message: json.message,
    code: json.code,
    data_keys: json.data && typeof json.data === "object" ? Object.keys(json.data) : [],
    sample: json.data || json
  };
}

fs.mkdirSync("exports", { recursive: true });

const results = [];

for (const endpoint of calls) {
  console.log(`Testing ${endpoint}...`);
  const result = await call(endpoint);
  results.push(result);

  console.log({
    endpoint: result.endpoint,
    http_status: result.http_status,
    result: result.result,
    message: result.message,
    code: result.code,
    data_keys: result.data_keys
  });
}

const out = "exports/digistore24_probe_results.json";
fs.writeFileSync(out, JSON.stringify(results, null, 2));

console.log("");
console.log("Wrote full probe results:");
console.log(out);
console.log("");
console.log("Show summary:");
console.log("cat exports/digistore24_probe_results.json | python3 -m json.tool | head -n 200");
