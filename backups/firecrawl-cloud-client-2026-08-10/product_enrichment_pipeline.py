#!/usr/bin/env python3
"""
Product enrichment pipeline: Firecrawl (self-hosted) + Ollama.

Two entry points into discovery:
  --site   https://example.com        -> map the site, filter to product-like URLs
  --search "wireless earbuds under 50" -> Firecrawl /search to find candidate pages
  (pass both to combine)

Each discovered URL is then run through /extract with a schema (edit PRODUCT_SCHEMA
below) using your local Ollama model, and results are written to a JSONL + CSV file.

Requires: pip install requests --break-system-packages
Firecrawl must be running at FIRECRAWL_URL with OPENAI_BASE_URL pointed at Ollama
(see firecrawl-ollama-rag-setup.md).
"""

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

import requests

FIRECRAWL_URL = "http://localhost:3002"
REQUEST_TIMEOUT = 90          # seconds, must exceed the "timeout" in each payload
MAP_LIMIT = 500                # cap how many URLs /map can return
CONCURRENCY_DELAY = 0.5        # seconds between extract calls (local LLM is slow)

# ---- Edit this to match what you actually need to capture ----
PRODUCT_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "price": {"type": "string"},
        "currency": {"type": "string"},
        "sku_or_model": {"type": "string"},
        "availability": {"type": "string"},
        "brand": {"type": "string"},
        "description": {"type": "string"},
        "key_specs": {"type": "array", "items": {"type": "string"}},
        "image_url": {"type": "string"},
    },
    "required": ["name", "price"],
}

# Heuristic filter for "does this URL look like a product page" during /map discovery.
# Tune this per site — cheap and fast, avoids burning LLM calls on category/blog pages.
PRODUCT_URL_HINTS = re.compile(
    r"/(product|products|item|p|shop|listing|dp)/", re.IGNORECASE
)


def firecrawl_map(site_url: str) -> list[str]:
    resp = requests.post(
        f"{FIRECRAWL_URL}/v2/map",
        json={"url": site_url, "limit": MAP_LIMIT},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    urls = [item["url"] if isinstance(item, dict) else item for item in data.get("links", [])]
    return urls


def firecrawl_search(query: str, num_results: int = 10) -> list[str]:
    resp = requests.post(
        f"{FIRECRAWL_URL}/v2/search",
        json={"query": query, "limit": num_results},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return [item["url"] for item in data.get("data", []) if "url" in item]


def filter_product_urls(urls: list[str]) -> list[str]:
    return [u for u in urls if PRODUCT_URL_HINTS.search(u)]


def firecrawl_extract(url: str, schema: dict) -> dict | None:
    payload = {
        "urls": [url],
        "schema": schema,
        "timeout": 60000,
    }
    try:
        resp = requests.post(
            f"{FIRECRAWL_URL}/v2/extract",
            json=payload,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        result = resp.json()
        if result.get("success"):
            return result.get("data")
        print(f"  [warn] extract reported failure for {url}: {result}", file=sys.stderr)
        return None
    except requests.RequestException as e:
        print(f"  [error] {url}: {e}", file=sys.stderr)
        return None


def run(site: str | None, search: str | None, out_prefix: str):
    candidate_urls: set[str] = set()

    if site:
        print(f"Mapping {site} ...")
        mapped = firecrawl_map(site)
        print(f"  found {len(mapped)} URLs total")
        filtered = filter_product_urls(mapped)
        print(f"  {len(filtered)} look like product pages (regex filter)")
        candidate_urls.update(filtered)

    if search:
        print(f"Searching: {search!r} ...")
        found = firecrawl_search(search)
        print(f"  found {len(found)} results")
        candidate_urls.update(found)

    if not candidate_urls:
        print("No candidate URLs found — nothing to enrich. Check your site/search input,"
              " or widen PRODUCT_URL_HINTS if you used --site.", file=sys.stderr)
        return

    print(f"\nEnriching {len(candidate_urls)} candidate URLs ...")
    results = []
    for i, url in enumerate(sorted(candidate_urls), 1):
        print(f"  [{i}/{len(candidate_urls)}] {url}")
        data = firecrawl_extract(url, PRODUCT_SCHEMA)
        if data:
            entry = {"url": url, **data}
            results.append(entry)
        time.sleep(CONCURRENCY_DELAY)

    jsonl_path = Path(f"{out_prefix}.jsonl")
    with jsonl_path.open("w") as f:
        for r in results:
            f.write(json.dumps(r) + "\n")

    if results:
        fieldnames = ["url"] + list(PRODUCT_SCHEMA["properties"].keys())
        csv_path = Path(f"{out_prefix}.csv")
        with csv_path.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for r in results:
                row = dict(r)
                if isinstance(row.get("key_specs"), list):
                    row["key_specs"] = "; ".join(row["key_specs"])
                writer.writerow(row)
        print(f"\nWrote {len(results)} enriched products to {jsonl_path} and {csv_path}")
    else:
        print("\nNo products successfully enriched.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", help="Base site URL to map for product pages")
    parser.add_argument("--search", help="Search query to discover product pages")
    parser.add_argument("--out", default="products", help="Output file prefix (default: products)")
    args = parser.parse_args()

    if not args.site and not args.search:
        parser.error("Provide --site, --search, or both.")

    run(args.site, args.search, args.out)
