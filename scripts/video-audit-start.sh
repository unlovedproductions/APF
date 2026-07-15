#!/usr/bin/env bash
set -euo pipefail

APF_ROOT="/home/unloved/APF"
SHADOWCAST_ROOT="/home/unloved/shadowcast-"
APF_HEALTH_URL="http://127.0.0.1:3000/api/health"
SHADOWCAST_HEALTH_URL="http://127.0.0.1:8000/api/health"
APF_UI_URL="http://127.0.0.1:3000"
SHADOWCAST_UI_URL="http://127.0.0.1:8000"

health_ok() {
  curl -fsS --max-time 2 "$1" >/dev/null 2>&1
}

open_terminal_tab() {
  local title="$1"
  local command="$2"

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --tab --title="$title" -- bash -lc "$command"
    return 0
  fi

  if command -v konsole >/dev/null 2>&1; then
    konsole --new-tab -p tabtitle="$title" -e bash -lc "$command"
    return 0
  fi

  return 1
}

start_shadowcast_if_needed() {
  if health_ok "$SHADOWCAST_HEALTH_URL"; then
    echo "ShadowCast already healthy. Reusing current instance."
    return 0
  fi

  local cmd="cd \"$SHADOWCAST_ROOT\" && if [ -f .venv/bin/activate ]; then source .venv/bin/activate; elif [ -f venv/bin/activate ]; then source venv/bin/activate; fi && python3 backend/app.py"
  if ! open_terminal_tab "ShadowCast" "$cmd"; then
    echo "Could not open ShadowCast tab automatically." >&2
    echo "Run manually in a terminal tab:" >&2
    echo "cd \"$SHADOWCAST_ROOT\" && source .venv/bin/activate && python3 backend/app.py" >&2
    return 1
  fi
}

start_apf_if_needed() {
  if health_ok "$APF_HEALTH_URL"; then
    echo "APF already healthy. Reusing current instance."
    return 0
  fi

  local cmd="cd \"$APF_ROOT\" && pnpm local:start"
  if ! open_terminal_tab "APF" "$cmd"; then
    echo "Could not open APF tab automatically." >&2
    echo "Run manually in a terminal tab:" >&2
    echo "cd \"$APF_ROOT\" && pnpm local:start" >&2
    return 1
  fi
}

open_firefox_tabs() {
  if ! command -v firefox >/dev/null 2>&1; then
    echo "Firefox not found; skipping browser tab setup."
    return 0
  fi

  if pgrep -x firefox >/dev/null 2>&1; then
    firefox --new-tab "$APF_UI_URL" >/dev/null 2>&1 || true
    firefox --new-tab "$SHADOWCAST_UI_URL" >/dev/null 2>&1 || true
    return 0
  fi

  firefox --new-window "$APF_UI_URL" "$SHADOWCAST_UI_URL" >/dev/null 2>&1 &
}

wait_for_health() {
  local name="$1"
  local url="$2"
  local timeout_seconds="${3:-90}"
  local start_ts
  start_ts="$(date +%s)"

  while true; do
    if health_ok "$url"; then
      echo "$name is healthy: $url"
      return 0
    fi

    local now
    now="$(date +%s)"
    if (( now - start_ts >= timeout_seconds )); then
      echo "Timed out waiting for $name health at $url" >&2
      return 1
    fi
    sleep 1
  done
}

main() {
  local can_continue=0

  start_shadowcast_if_needed || can_continue=1
  start_apf_if_needed || can_continue=1
  open_firefox_tabs

  if (( can_continue != 0 )); then
    echo "Startup automation incomplete. Fix the missing startup command(s), then re-run." >&2
    exit 1
  fi

  wait_for_health "APF" "$APF_HEALTH_URL" 90
  wait_for_health "ShadowCast" "$SHADOWCAST_HEALTH_URL" 90

  cd "$APF_ROOT"
  node scripts/video-audit-matrix.mjs --skip-start "$@"
}

main "$@"
