#!/usr/bin/env bash
set -euo pipefail

cd /home/unloved/APF
mkdir -p exports .runtime

PID_FILE=".runtime/review-enrichment-daemon.pid"
LOG_FILE="exports/review-enrichment-daemon.log"
ERR_FILE="exports/review-enrichment-daemon.err.log"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Review enrichment daemon already running: PID $OLD_PID"
    exit 0
  fi
fi

nohup "$(command -v node)" scripts/review-enrichment-daemon.mjs >/dev/null 2>> "$ERR_FILE" &
PID="$!"

echo "$PID" > "$PID_FILE"

echo "Started review enrichment daemon: PID $PID"
echo "Log: $LOG_FILE"
