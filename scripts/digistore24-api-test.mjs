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

const base = process.env.DIGISTORE24_API_BASE_URL || "https://www.digistore24.com/api/call";
const key = process.env.DIGISTORE24_API_KEY;

if (!key) {
  console.error("DIGISTORE24_API_KEY missing from .env");
  process.exit(1);
}

const url = `${base.replace(/\/+$/, "")}/listMarketplaceEntries?language=en`;

console.log("Testing Digistore24 API key...");
console.log("Endpoint:", url);
console.log("API key: hidden");

const res = await fetch(url, {
  headers: {
    "X-DS-API-KEY": key,
    "Accept": "application/json"
  }
});

const text = await res.text();

console.log("HTTP status:", res.status);

let json;
try {
  json = JSON.parse(text);
} catch {
  console.error("Response was not JSON. First 500 chars:");
  console.error(text.slice(0, 500));
  process.exit(1);
}

if (!res.ok || json.result !== "success") {
  console.error("");
  console.error("Digistore24 API test failed.");
  console.error("result:", json.result);
  console.error("message:", json.message);
  console.error("code:", json.code);
  console.error("");
  console.error("Create a new Digistore24 API key with Read access, make sure it is Active, and leave Allowed IPs blank unless you know your exact outbound IP.");
  process.exit(1);
}

console.log("");
console.log("OK: Digistore24 API key works.");
console.log("Top-level response keys:", Object.keys(json));

console.log("");
console.log("Response sample:");
console.dir(json, { depth: 3 });
