#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Starting APF..."

if [ -f ".env" ] && grep -q '^REVIEW_ENRICHMENT_ENABLED=true' .env; then
  echo "Starting review enrichment service..."
  if ! bash scripts/start-review-enrichment-daemon.sh; then
    echo "WARNING: review enrichment daemon failed to start. Enrichment will not run until you fix this." >&2
  fi
else
  echo "Review enrichment is disabled or .env missing."
fi

echo ""
echo "Starting APF dev server..."
pnpm run dev
