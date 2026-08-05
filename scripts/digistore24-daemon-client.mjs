#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const cmd = process.argv[2] || "health";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const port = process.env.DIGISTORE24_DAEMON_PORT || "3219";
const baseUrl = `http://127.0.0.1:${port}`;
const ensure = hasFlag("--ensure") || process.env.DIGISTORE24_DAEMON_AUTO_START === "true";

function collectWaitSeconds() {
  return Math.max(
    30,
    Math.min(
      1800,
      Number(
        arg(
          "--wait",
          process.env.DIGISTORE24_LOGIN_WAIT_SECONDS
            || process.env.DIGISTORE24_REFRESH_WAIT_SECONDS
            || "600",
        ),
      ) || 600,
    ),
  );
}

function buildPath() {
  if (cmd === "collect") {
    const params = new URLSearchParams();
    params.set("limit", arg("--limit", "10"));
    params.set("wait", String(collectWaitSeconds()));
    const userId = Number(process.env.APF_USER_ID || "0");
    if (userId > 0) params.set("userId", String(userId));
    if (hasFlag("--promote")) params.set("promote", "1");
    if (hasFlag("--confirm-promote")) params.set("confirm", "1");
    return `/collect?${params.toString()}`;
  }

  if (cmd === "open") return "/open";
  if (cmd === "stop" || cmd === "shutdown") return "/shutdown";

  return "/health";
}

/**
 * Collect can run many minutes (login wait + N detail pages + promote).
 * Global fetch/undici defaults headersTimeout to 300s, which killed long
 * /collect calls with "fetch failed" while the daemon was still working.
 * Use node:http with an explicit overall deadline instead.
 */
function fetchTimeoutMs(pathname) {
  const override = Number(arg("--timeout-ms", process.env.DIGISTORE24_DAEMON_FETCH_TIMEOUT_MS || "0"));
  if (Number.isFinite(override) && override > 0) return override;
  if (String(pathname).startsWith("/collect")) {
    const waitMs = collectWaitSeconds() * 1000;
    const limit = Math.max(1, Number(arg("--limit", "10")) || 10);
    // ~90s per product for detail+promote, plus login wait, plus 2m slack.
    return waitMs + (limit * 90_000) + 120_000;
  }
  return 30_000;
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function tryFetch(pathname) {
  const timeoutMs = fetchTimeoutMs(pathname);
  const url = new URL(pathname, baseUrl);

  return new Promise((resolve) => {
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        // Disable idle socket timeout; enforce overall deadline ourselves.
        timeout: 0,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(timer);
          const text = Buffer.concat(chunks).toString("utf8");
          const status = Number(res.statusCode || 0);
          resolve({
            ok: true,
            res: {
              ok: status >= 200 && status < 300,
              status,
            },
            text,
            timeoutMs,
          });
        });
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err?.message || String(err), timeoutMs });
    });

    req.end();
  });
}

function startDaemonDetached() {
  fs.mkdirSync("exports", { recursive: true });

  const logPath = path.resolve("exports/digistore24-daemon.log");
  const errPath = path.resolve("exports/digistore24-daemon.err.log");

  const out = fs.openSync(logPath, "a");
  const err = fs.openSync(errPath, "a");

  const child = spawn(
    process.execPath,
    ["scripts/digistore24-browser-daemon.mjs"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DIGISTORE24_DAEMON_STARTED_BY: "apf" },
      detached: true,
      stdio: ["ignore", out, err],
    }
  );

  child.unref();

  return { pid: child.pid, logPath, errPath };
}

async function ensureDaemonRunning() {
  const health = await tryFetch("/health");
  if (health.ok && health.res.ok) return { alreadyRunning: true };

  const started = startDaemonDetached();
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const check = await tryFetch("/health");
    if (check.ok && check.res.ok) return { alreadyRunning: false, started };
    await sleep(1000);
  }

  console.error(JSON.stringify({
    ok: false,
    error: "digistore24_daemon_start_timeout",
    message: "APF started the Digistore24 daemon, but it did not become healthy within 30 seconds.",
    pid: started.pid,
    logs: started.logPath,
    errorLogs: started.errPath
  }, null, 2));

  process.exit(1);
}

const pathname = buildPath();

if (cmd === "stop" || cmd === "shutdown") {
  const result = await tryFetch("/shutdown");

  if (result.ok) console.log(result.text);
  else console.log(JSON.stringify({ ok: true, message: "Digistore24 daemon was not running." }, null, 2));

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const check = await tryFetch("/health");
    if (!check.ok) process.exit(0);
    await sleep(500);
  }

  console.error(JSON.stringify({
    ok: false,
    error: "digistore24_daemon_stop_timeout",
    message: "Stop was requested, but daemon port is still responding."
  }, null, 2));

  process.exit(1);
}

if (ensure) {
  await ensureDaemonRunning();
}

const result = await tryFetch(pathname);

if (!result.ok) {
  console.error(JSON.stringify({
    ok: false,
    error: "digistore24_daemon_not_running",
    message: "Digistore24 daemon is not running. APF can auto-start it when called with --ensure.",
    url: `${baseUrl}${pathname}`,
    detail: result.error,
    timeoutMs: result.timeoutMs,
  }, null, 2));
  process.exit(1);
}

console.log(result.text);

if (!result.res.ok) process.exit(1);
