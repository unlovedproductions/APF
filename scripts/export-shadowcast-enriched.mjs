#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildPayload } from "./shadowcast-direct-lib.mjs";

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

loadEnv(path.resolve(process.cwd(), ".env"));

const productId = process.argv[2];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing.");
  process.exit(1);
}
if (!productId) {
  console.error("Usage: pnpm run export:shadowcast <product_id>");
  process.exit(1);
}

async function main() {
  const payload = await buildPayload(Number(productId));
  const safe = String(payload?.product?.name || `product_${productId}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const outDir = path.resolve(process.cwd(), "exports");
  fs.mkdirSync(outDir, {recursive: true});
  const out = path.join(outDir, `${safe || "product"}_shadowcast_enriched.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(out);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
