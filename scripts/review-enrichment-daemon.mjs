#!/usr/bin/env node
import fs from "node:fs";
import { spawn } from "node:child_process";

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;

    let v = m[2].trim();

    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }

    process.env[m[1]] ||= v;
  }
}

loadEnv();

const enabled =
  process.env.REVIEW_ENRICHMENT_ENABLED === "true" ||
  process.env.REVIEW_ENRICHMENT_ENABLED === "1";

if (!enabled) {
  console.log("Review enrichment daemon not started because REVIEW_ENRICHMENT_ENABLED is not true.");
  process.exit(0);
}

const intervalSeconds = Math.max(
  60,
  Number(process.env.REVIEW_ENRICHMENT_DAEMON_INTERVAL_SECONDS || "600")
);

const runsPerCycle = Math.max(
  1,
  Math.min(20, Number(process.env.REVIEW_ENRICHMENT_DAEMON_RUNS_PER_CYCLE || "3"))
);

fs.mkdirSync("exports", { recursive: true });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync("exports/review-enrichment-daemon.log", line + "\n");
}

function runWorkerOnce() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["scripts/review-enrichment-worker.mjs", "--once"],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    child.stdout.on("data", d => {
      const s = d.toString().trim();
      if (s) log(s);
    });

    child.stderr.on("data", d => {
      const s = d.toString().trim();
      if (s) log("ERR " + s);
    });

    child.on("close", code => {
      log(`review-enrichment-worker --once exited with ${code}`);
      resolve(code);
    });
  });
}

let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
  log("received SIGINT; stopping");
});

process.on("SIGTERM", () => {
  stopping = true;
  log("received SIGTERM; stopping");
});

log(`review enrichment daemon started; interval=${intervalSeconds}s runsPerCycle=${runsPerCycle}`);

while (!stopping) {
  for (let i = 0; i < runsPerCycle && !stopping; i++) {
    log(`cycle run ${i + 1}/${runsPerCycle}`);
    await runWorkerOnce();
  }

  if (stopping) break;

  log(`sleeping ${intervalSeconds}s`);
  await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
}

log("review enrichment daemon stopped");
