#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APF_ROOT="${APF_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$APF_ROOT"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm use 22 || nvm use 24 || true
fi

set -a
source .env
set +a

export PORT="${PORT:-3001}"
echo "Opening APF on http://localhost:${PORT}"
pnpm dev
