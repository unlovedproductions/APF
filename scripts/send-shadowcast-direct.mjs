#!/usr/bin/env node
import { spawn } from "node:child_process";
import { sendToShadowCast } from "./shadowcast-direct-lib.mjs";

const productId = process.argv[2];
const shouldOpen = process.argv.includes("--open");

if (!productId) {
  console.error("Usage: pnpm run shadowcast:send <product_id> [--open]");
  process.exit(1);
}

try {
  const result = await sendToShadowCast(productId);
  console.log(JSON.stringify(result, null, 2));

  if (shouldOpen && result.open_url) {
    spawn("xdg-open", [result.open_url], {
      detached: true,
      stdio: "ignore"
    }).unref();
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
