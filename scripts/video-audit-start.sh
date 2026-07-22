#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APF_ROOT="${APF_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SHADOWCAST_ROOT="${SHADOWCAST_ROOT:-$(cd "$APF_ROOT/.." && pwd)/shadowcast-}"
LAUNCHER_DIR="${LAUNCHER_DIR:-$HOME/.local/bin/unloved-launchers}"
SHADOWCAST_BASE="${SHADOWCAST_BASE_URL:-http://127.0.0.1:8000}"
SHADOWCAST_HEALTH_URL="${SHADOWCAST_BASE%/}/api/health"
SHADOWCAST_UI_URL="${SHADOWCAST_BASE%/}"
APF_HEALTH_TIMEOUT="${SHADOWCAST_AUDIT_HEALTH_TIMEOUT_SEC:-180}"

discover_apf_base_url() {
  local port
  for port in $(seq 3000 3010); do
    if app_health_ok "http://127.0.0.1:${port}/api/health" "APF"; then
      echo "http://127.0.0.1:${port}"
      return 0
    fi
  done
  return 1
}

app_health_ok() {
  local url="$1"
  local app="$2"
  local body
  body="$(curl -fsS --max-time 2 "$url" 2>/dev/null || echo "")"
  [[ "$body" == *"\"app\":\"$app\""* ]] || [[ "$body" == *"\"app\": \"$app\""* ]]
}

open_terminal_tab() {
  local title="$1"
  local script_path="$2"

  if [ ! -x "$script_path" ] && [ -f "$script_path" ]; then
    chmod +x "$script_path" 2>/dev/null || true
  fi

  if command -v cosmic-term >/dev/null 2>&1; then
    cosmic-term --working-directory "$HOME" -- bash -lc "exec '$script_path'" &
    return 0
  fi

  if command -v kitty >/dev/null 2>&1; then
    if kitty @ launch --type=tab --title "$title" bash -lc "exec '$script_path'" 2>/dev/null; then
      return 0
    fi
    kitty --title "$title" bash -lc "exec '$script_path'" &
    return 0
  fi

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --tab --title="$title" -- bash -lc "exec '$script_path'" &
    return 0
  fi

  if command -v konsole >/dev/null 2>&1; then
    konsole --new-tab -p tabtitle="$title" -e bash -lc "exec '$script_path'" &
    return 0
  fi

  if [ -x "$LAUNCHER_DIR/open-terminal.sh" ]; then
    "$LAUNCHER_DIR/open-terminal.sh" "$title" "$script_path"
    return 0
  fi

  return 1
}

start_shadowcast_if_needed() {
  if app_health_ok "$SHADOWCAST_HEALTH_URL" "ShadowCast"; then
    echo "ShadowCast already healthy. Reusing current instance."
    return 0
  fi

  local script_path="$LAUNCHER_DIR/run-shadowcast-terminal.sh"
  if [ ! -f "$script_path" ]; then
    script_path="$APF_ROOT/scripts/.video-audit-run-shadowcast.sh"
    cat >"$script_path" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
cd "$SHADOWCAST_ROOT/backend"
if [ -f "$SHADOWCAST_ROOT/venv/bin/activate" ]; then
  source "$SHADOWCAST_ROOT/venv/bin/activate"
elif [ -f "$SHADOWCAST_ROOT/.venv/bin/activate" ]; then
  source "$SHADOWCAST_ROOT/.venv/bin/activate"
fi
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
EOF
    chmod +x "$script_path"
  fi

  if ! open_terminal_tab "ShadowCast" "$script_path"; then
    echo "Could not open ShadowCast tab automatically." >&2
    echo "Run manually in a terminal tab:" >&2
    echo "  $script_path" >&2
    return 1
  fi
}

start_apf_if_needed() {
  local apf_base
  if apf_base="$(discover_apf_base_url)"; then
    echo "APF already healthy. Reusing current instance at $apf_base"
    export APF_BASE_URL="$apf_base"
    return 0
  fi

  local script_path="$APF_ROOT/scripts/.video-audit-run-apf.sh"
  if [ ! -f "$script_path" ]; then
    cat >"$script_path" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
APF_ROOT="\${APF_ROOT:-\$(cd "\$SCRIPT_DIR/.." && pwd)}"
cd "\$APF_ROOT"
if [ -s "\$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="\$HOME/.nvm"
  source "\$NVM_DIR/nvm.sh"
  nvm use 22 || nvm use 24 || true
fi
set -a
source .env
set +a
export PORT="\${PORT:-3001}"
echo "Opening APF on http://localhost:\${PORT}"
pnpm dev
EOF
    chmod +x "$script_path"
  fi

  if ! open_terminal_tab "APF" "$script_path"; then
    echo "Could not open APF tab automatically." >&2
    echo "Run manually in a terminal tab:" >&2
    echo "  $script_path" >&2
    return 1
  fi
}

open_firefox_tabs() {
  local apf_url="${APF_BASE_URL:-}"
  if [ -z "$apf_url" ]; then
    apf_url="$(discover_apf_base_url || echo "http://127.0.0.1:3001")"
  fi

  if ! command -v firefox >/dev/null 2>&1; then
    echo "Firefox not found; skipping browser tab setup."
    return 0
  fi

  if pgrep -x firefox >/dev/null 2>&1; then
    firefox --new-tab "$apf_url" >/dev/null 2>&1 || true
    firefox --new-tab "$SHADOWCAST_UI_URL" >/dev/null 2>&1 || true
    return 0
  fi

  firefox --new-window "$apf_url" "$SHADOWCAST_UI_URL" >/dev/null 2>&1 &
}

wait_for_health() {
  local name="$1"
  local url="$2"
  local app="$3"
  local timeout_seconds="${4:-90}"
  local start_ts
  start_ts="$(date +%s)"

  while true; do
    if app_health_ok "$url" "$app"; then
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

  if ! APF_BASE_URL="$(discover_apf_base_url)"; then
    echo "APF did not become healthy on ports 3000-3010." >&2
    exit 1
  fi
  export APF_BASE_URL

  wait_for_health "APF" "${APF_BASE_URL}/api/health" "APF" "$APF_HEALTH_TIMEOUT"
  wait_for_health "ShadowCast" "$SHADOWCAST_HEALTH_URL" "ShadowCast" "$APF_HEALTH_TIMEOUT"

  cd "$APF_ROOT"
  APF_BASE_URL="$APF_BASE_URL" node scripts/video-audit-matrix.mjs --skip-start "$@"
}

main "$@"
