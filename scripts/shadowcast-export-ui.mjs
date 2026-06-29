#!/usr/bin/env node
import http from "node:http";
import { URL } from "node:url";
import { listProducts, sendToShadowCast, shadowcastBaseUrl } from "./shadowcast-direct-lib.mjs";

const PORT = Number(process.env.APF_SHADOWCAST_EXPORT_PORT || "3202");

function htmlEscape(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function page(rows, q = "", message = "") {
  const body = rows.map(p => {
    const status = p.enrichment_status || "not enriched yet";
    const sourceCount = p.source_count ?? 0;
    const confidence = p.confidence_score ?? "";

    return `
      <tr>
        <td>${htmlEscape(p.id)}</td>
        <td>
          <strong>${htmlEscape(p.name)}</strong><br>
          <small>${htmlEscape(p.vendor || "")}</small>
        </td>
        <td>${htmlEscape(p.category || "")}</td>
        <td>${htmlEscape(p.hiddenGemScore ?? "")}</td>
        <td>
          ${htmlEscape(status)}<br>
          <small>${htmlEscape(sourceCount)} sources ${confidence ? " · confidence " + htmlEscape(confidence) : ""}</small>
        </td>
        <td>
          <form method="POST" action="/send">
            <input type="hidden" name="id" value="${htmlEscape(p.id)}">
            <button type="submit">Open in ShadowCast</button>
          </form>
        </td>
      </tr>
    `;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>APF → ShadowCast Direct Export</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; background: #101114; color: #f3f3f3; }
    a { color: #8ab4ff; }
    input, button { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid #444; }
    input { min-width: 360px; background: #181a20; color: #fff; }
    button { cursor: pointer; background: #ffffff; color: #111; border: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { padding: 10px; border-bottom: 1px solid #333; vertical-align: top; text-align: left; }
    small { color: #aaa; }
    .message { margin: 16px 0; padding: 12px; background: #1f2b1f; border: 1px solid #315a31; border-radius: 8px; }
    .top { display:flex; justify-content:space-between; align-items:center; gap:16px; }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>APF → ShadowCast Direct Export</h1>
      <p>Select an APF product. It will send enriched JSON directly to ShadowCast and open the prefilled draft.</p>
      <small>ShadowCast: ${htmlEscape(shadowcastBaseUrl())}</small>
    </div>
  </div>

  ${message ? `<div class="message">${htmlEscape(message)}</div>` : ""}

  <form method="GET" action="/">
    <input name="q" value="${htmlEscape(q)}" placeholder="Search product, vendor, category">
    <button type="submit">Search</button>
    <a href="/">Clear</a>
  </form>

  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Product</th>
        <th>Category</th>
        <th>Hidden Gem</th>
        <th>Review Enrichment</th>
        <th>Export</th>
      </tr>
    </thead>
    <tbody>
      ${body || `<tr><td colspan="6">No products found.</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === "GET" && url.pathname === "/") {
      const q = url.searchParams.get("q") || "";
      const rows = await listProducts(q);
      res.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
      res.end(page(rows, q));
      return;
    }

    if (req.method === "POST" && url.pathname === "/send") {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const id = params.get("id");

      if (!id) {
        res.writeHead(400, {"Content-Type": "text/plain"});
        res.end("Missing product id");
        return;
      }

      const result = await sendToShadowCast(id);

      res.writeHead(303, {
        "Location": result.open_url,
        "Cache-Control": "no-store"
      });
      res.end();
      return;
    }

    res.writeHead(404, {"Content-Type": "text/plain"});
    res.end("Not found");
  } catch (err) {
    console.error(err);
    res.writeHead(500, {"Content-Type": "text/plain"});
    res.end(err.message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`APF → ShadowCast Direct Export UI running: http://localhost:${PORT}`);
});
