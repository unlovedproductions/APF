#!/usr/bin/env bash
set -euo pipefail

cd /home/unloved/APF

echo "Starting APF..."

if [ -f ".env" ] && grep -q '^REVIEW_ENRICHMENT_ENABLED=true' .env; then
  echo "Starting review enrichment service..."
  bash scripts/start-review-enrichment-daemon.sh || true
else
  echo "Review enrichment is disabled or .env missing."
fi

echo ""
echo "Starting APF dev server..."
pnpm run dev
