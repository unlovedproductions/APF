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

dev_pid=""

stop_dev() {
  if [[ -n "${dev_pid}" ]] && kill -0 "${dev_pid}" 2>/dev/null; then
    kill -TERM "${dev_pid}" 2>/dev/null || true
    wait "${dev_pid}" 2>/dev/null || true
  fi
  echo "APF stopped."
  exit 0
}

trap stop_dev INT TERM

pnpm run dev &
dev_pid=$!
wait "${dev_pid}" && code=0 || code=$?

# 130 = SIGINT, 143 = SIGTERM — intentional stop, not a crash
if [[ "${code}" -eq 130 || "${code}" -eq 143 ]]; then
  echo "APF stopped."
  exit 0
fi
exit "${code}"
