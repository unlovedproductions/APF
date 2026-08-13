#!/usr/bin/env python3
"""
Vendor/product trust research pipeline for affiliate marketplaces (Digistore24 etc.)

For a given vendor or product name, runs a set of targeted searches and pulls
structured signal out of each: general reviews, Trustpilot, BBB, scam/complaint
mentions, and competitor landscape. Produces one JSON trust report + a flat CSV
summary you can scan quickly across many vendors.

Requires: pip install requests --break-system-packages
Firecrawl must be running at FIRECRAWL_URL with Ollama wired up (see
firecrawl-ollama-rag-setup.md).

NOTE: Trustpilot and BBB both run anti-bot protection. Self-hosted Firecrawl
(no Fire-engine) will sometimes fail to scrape those pages directly. When a
direct scrape fails, this script falls back to using the search-result
snippet itself as a lower-confidence signal, and flags it as such in output.
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
REQUEST_TIMEOUT = 90
SEARCH_DELAY = 0.5

REVIEW_SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "overall_sentiment": {"type": "string", "enum": ["positive", "mixed", "negative", "unclear"]},
        "positive_points": {"type": "array", "items": {"type": "string"}},
        "negative_points": {"type": "array", "items": {"type": "string"}},
        "recurring_complaints": {"type": "array", "items": {"type": "string"}},
        "mentions_refund_issues": {"type": "boolean"},
        "mentions_billing_issues": {"type": "boolean"},
    },
}

RATING_SCHEMA = {
    "type": "object",
    "properties": {
        "rating_out_of_5": {"type": "string"},
        "review_count": {"type": "string"},
        "accreditation_status": {"type": "string"},
        "summary": {"type": "string"},
    },
}

SCAM_SCREEN_SCHEMA = {
    "type": "object",
    "properties": {
        "red_flags_found": {"type": "boolean"},
        "flag_summary": {"type": "array", "items": {"type": "string"}},
        "source_credibility": {"type": "string", "enum": ["forum/anecdotal", "news/press", "review-site", "unclear"]},
    },
}


def fc_search(query: str, num_results: int = 5) -> list[dict]:
    resp = requests.post(
        f"{FIRECRAWL_URL}/v2/search",
        json={"query": query, "limit": num_results},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


def fc_extract(url: str, schema: dict) -> dict | None:
    try:
        resp = requests.post(
            f"{FIRECRAWL_URL}/v2/extract",
            json={"urls": [url], "schema": schema, "timeout": 60000},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        result = resp.json()
        if result.get("success"):
            return result.get("data")
    except requests.RequestException as e:
        print(f"    [error] extract failed for {url}: {e}", file=sys.stderr)
    return None


def fc_scrape_markdown(url: str) -> str | None:
    try:
        resp = requests.post(
            f"{FIRECRAWL_URL}/v2/scrape",
            json={"url": url, "formats": ["markdown"], "timeout": 60000},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        result = resp.json()
        if result.get("success"):
            return result["data"].get("markdown")
    except requests.RequestException as e:
        print(f"    [error] scrape failed for {url}: {e}", file=sys.stderr)
    return None


def research_reviews(vendor: str) -> dict:
    print(f"  Searching general reviews for {vendor} ...")
    results = fc_search(f"{vendor} reviews", num_results=5)
    if not results:
        return {"status": "no_results"}
    top_url = results[0]["url"]
    data = fc_extract(top_url, REVIEW_SUMMARY_SCHEMA)
    return {"status": "ok" if data else "extract_failed", "source_url": top_url,
            "all_result_urls": [r["url"] for r in results], "data": data}


def research_trustpilot(vendor: str) -> dict:
    print(f"  Checking Trustpilot for {vendor} ...")
    results = fc_search(f"{vendor} trustpilot")
    tp_results = [r for r in results if "trustpilot.com" in r.get("url", "")]
    if not tp_results:
        return {"status": "not_found"}
    url = tp_results[0]["url"]
    data = fc_extract(url, RATING_SCHEMA)
    if data:
        return {"status": "ok", "source_url": url, "data": data}
    # fallback: use the search snippet itself, lower confidence
    return {
        "status": "scrape_blocked_used_snippet",
        "source_url": url,
        "snippet": tp_results[0].get("description", ""),
    }


def research_bbb(vendor: str) -> dict:
    print(f"  Checking BBB for {vendor} ...")
    results = fc_search(f"{vendor} bbb.org rating")
    bbb_results = [r for r in results if "bbb.org" in r.get("url", "")]
    if not bbb_results:
        return {"status": "not_found"}
    url = bbb_results[0]["url"]
    data = fc_extract(url, RATING_SCHEMA)
    if data:
        return {"status": "ok", "source_url": url, "data": data}
    return {
        "status": "scrape_blocked_used_snippet",
        "source_url": url,
        "snippet": bbb_results[0].get("description", ""),
    }


def research_scam_alerts(vendor: str) -> dict:
    print(f"  Screening scam/complaint mentions for {vendor} ...")
    results = fc_search(f"{vendor} scam complaints reddit")
    if not results:
        return {"status": "no_results"}
    top_url = results[0]["url"]
    data = fc_extract(top_url, SCAM_SCREEN_SCHEMA)
    return {
        "status": "ok" if data else "extract_failed",
        "source_url": top_url,
        "all_result_urls": [r["url"] for r in results],
        "data": data,
    }


def research_competitors(vendor: str, product_category: str) -> dict:
    print(f"  Researching competitors in '{product_category}' ...")
    results = fc_search(f"best {product_category} alternatives to {vendor}", num_results=6)
    competitors = [{"name": r.get("title", ""), "url": r.get("url", "")} for r in results]
    return {"status": "ok" if competitors else "no_results", "competitors": competitors}


def build_report(vendor: str, product_category: str) -> dict:
    print(f"\n=== Researching: {vendor} ===")
    report = {
        "vendor": vendor,
        "product_category": product_category,
        "reviews": research_reviews(vendor),
        "trustpilot": research_trustpilot(vendor),
        "bbb": research_bbb(vendor),
        "scam_screen": research_scam_alerts(vendor),
        "competitors": research_competitors(vendor, product_category) if product_category else {"status": "skipped"},
    }
    time.sleep(SEARCH_DELAY)
    return report


def flatten_for_csv(report: dict) -> dict:
    rev = report["reviews"].get("data") or {}
    tp = report["trustpilot"]
    bbb = report["bbb"]
    scam = report["scam_screen"].get("data") or {}

    return {
        "vendor": report["vendor"],
        "review_sentiment": rev.get("overall_sentiment", ""),
        "recurring_complaints": "; ".join(rev.get("recurring_complaints", []) or []),
        "refund_issues_flagged": rev.get("mentions_refund_issues", ""),
        "billing_issues_flagged": rev.get("mentions_billing_issues", ""),
        "trustpilot_status": tp.get("status", ""),
        "trustpilot_rating": (tp.get("data") or {}).get("rating_out_of_5", tp.get("snippet", "")[:80]),
        "bbb_status": bbb.get("status", ""),
        "bbb_rating": (bbb.get("data") or {}).get("rating_out_of_5", bbb.get("snippet", "")[:80]),
        "scam_red_flags": scam.get("red_flags_found", ""),
        "scam_flag_summary": "; ".join(scam.get("flag_summary", []) or []),
        "num_competitors_found": len(report.get("competitors", {}).get("competitors", [])),
    }


def run(vendors: list[str], product_category: str, out_prefix: str):
    reports = [build_report(v, product_category) for v in vendors]

    json_path = Path(f"{out_prefix}.json")
    json_path.write_text(json.dumps(reports, indent=2))

    csv_path = Path(f"{out_prefix}.csv")
    rows = [flatten_for_csv(r) for r in reports]
    if rows:
        with csv_path.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

    print(f"\nWrote full reports to {json_path}")
    print(f"Wrote scan-friendly summary to {csv_path}")
    print("\nReminder: treat 'scrape_blocked_used_snippet' and search-snippet-derived")
    print("fields as lower confidence than a direct page extract — verify manually")
    print("before treating them as a final answer on a vendor.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vendor", action="append", dest="vendors",
                         help="Vendor or product name to research. Repeat for multiple.")
    parser.add_argument("--vendors-file", help="Path to a text file, one vendor name per line.")
    parser.add_argument("--category", default="", help="Product category, used for competitor search.")
    parser.add_argument("--out", default="vendor_trust_report", help="Output file prefix.")
    args = parser.parse_args()

    vendor_list = list(args.vendors or [])
    if args.vendors_file:
        vendor_list.extend(
            line.strip() for line in Path(args.vendors_file).read_text().splitlines() if line.strip()
        )

    if not vendor_list:
        parser.error("Provide --vendor (repeatable) or --vendors-file.")

    run(vendor_list, args.category, args.out)
