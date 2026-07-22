#!/usr/bin/env bash
set -Eeuo pipefail
cd /home/unloved/APF
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm use 22 || nvm use 24 || true
fi
set -a
source .env
set +a
export PORT=3001
echo "Opening APF on http://localhost:${PORT}"
pnpm dev
