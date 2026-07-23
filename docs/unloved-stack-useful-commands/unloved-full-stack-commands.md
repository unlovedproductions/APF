---
title: Unloved Full Stack Commands
author: Unloved Productions
date: July 2026
---

# Unloved Full Stack Commands

Desktop launcher and manual startup reference for the full Unloved Productions local stack: infrastructure, APF, ShadowCast, and Mission Control.

For APF-only enrichment, Digistore24, and scoring commands, see **Unloved Stack Useful Commands** in this folder.

---

## Repo paths

| Repo | Path |
|------|------|
| APF | `~/APF` |
| ShadowCast | `~/shadowcast-` |
| Mission Control | `~/mission-control` |
| SearXNG (Docker) | `~/searxng` |
| Desktop launchers | `~/.local/bin/unloved-launchers` |

---

## Shared secret

`INTERNAL_SERVICE_SECRET` must be **identical** in:

- `~/APF/.env`
- `~/shadowcast-/backend/.env`
- `~/mission-control/backend/.env`

Preflight check:

```bash
~/.local/bin/unloved-launchers/preflight-unloved-stack.sh
```

---

## Service map

| Service | URL | Start (summary) |
|---------|-----|-----------------|
| MySQL | per `DATABASE_URL` | `docker start apf-mysql` |
| SearXNG | http://localhost:8088 | `cd ~/searxng && docker compose up -d` |
| Ollama | http://localhost:11434 | `ollama serve &` |
| APF | http://localhost:3001 | `pnpm local:start` or launcher |
| ShadowCast | http://localhost:8000 | uvicorn or launcher |
| Mission Control API | http://localhost:8100 | uvicorn or launcher |
| Mission Control UI | http://localhost:3100 | `pnpm dev` or launcher |

---

## One-shot desktop launchers

All launchers use **kitty** with a shared control socket (`/tmp/unloved-stack.sock`). The first launcher opens one kitty window; later launchers add tabs to that same window (or focus an existing tab). Node apps (APF, Mission Control frontend) run via **pnpm** — not npm.

Run from any directory:

```bash
# Full stack: 4 tabs (ShadowCast, APF, MC backend, MC frontend) in one kitty window
~/.local/bin/unloved-launchers/launch-unloved-stack.sh

# Individual apps (add tabs to the shared kitty window, or open it if closed)
~/.local/bin/unloved-launchers/launch-shadowcast.sh      # 1 tab
~/.local/bin/unloved-launchers/launch-apf.sh             # 1 tab (pnpm dev)
~/.local/bin/unloved-launchers/launch-mission-control.sh # 2 tabs (backend + pnpm frontend)

# Preflight only (MySQL, secrets, deps)
~/.local/bin/unloved-launchers/preflight-unloved-stack.sh
~/.local/bin/unloved-launchers/preflight-apf.sh
~/.local/bin/unloved-launchers/preflight-shadowcast.sh
```

`launch-unloved-stack.sh` tab order: ShadowCast → APF → MC Backend → MC Frontend → opens browser URLs when ready.

`launch-apf.sh` also starts the review enrichment daemon ~20s after APF if `REVIEW_ENRICHMENT_ENABLED=true`.

**Note:** Launchers do not start SearXNG. Start it separately (Infrastructure below).

---

## Infrastructure startup

```bash
# MySQL
docker start apf-mysql
# or: sudo systemctl start mysql

# SearXNG
cd ~/searxng
docker compose up -d
docker compose down             # stop
docker restart unloved-searxng  # restart

# Ollama
ollama serve &
ollama pull qwen2.5:14b-instruct-q5_K_M
```

---

## Manual per-service startup

### ShadowCast

```bash
cd ~/shadowcast-/backend
source ../.venv/bin/activate    # or ../venv/bin/activate
source .env
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Or run: `~/.local/bin/unloved-launchers/run-shadowcast-terminal.sh`

### APF

```bash
cd ~/APF
source .env
export PORT="${PORT:-3001}"
pnpm dev
# or: pnpm local:start   # includes enrichment daemon when enabled
```

Or run: `~/.local/bin/unloved-launchers/run-apf-terminal.sh`

### Mission Control backend

```bash
cd ~/mission-control/backend
source venv/bin/activate
source .env
python -m uvicorn main:app --host 0.0.0.0 --port 8100 --reload
```

Or run: `~/.local/bin/unloved-launchers/run-mission-backend-terminal.sh`

### Mission Control frontend

```bash
cd ~/mission-control/frontend
pnpm run dev -- --host 0.0.0.0 --port 3100
```

Or run: `~/.local/bin/unloved-launchers/run-mission-frontend-terminal.sh`

---

## Health matrix

```bash
docker ps --filter name=apf-mysql --filter name=unloved-searxng
curl -fsS http://localhost:8088/ >/dev/null && echo "SearXNG OK"
curl -fsS http://localhost:11434/api/tags >/dev/null && echo "Ollama OK"
curl -fsS http://localhost:8000/api/health >/dev/null && echo "ShadowCast OK"
curl -fsS http://localhost:3001/api/health >/dev/null && echo "APF OK"
curl -fsS http://localhost:8100/api/health >/dev/null && echo "MC backend OK"
curl -fsS http://localhost:3100 >/dev/null && echo "MC frontend OK"
```

Adjust APF port if `PORT` differs in `.env`.

---

## APF video audit helper

Auto-starts ShadowCast and APF if not healthy, then runs the style matrix audit:

```bash
cd ~/APF
pnpm video-audit:start
```

---

## Recommended full-stack startup order

1. Infrastructure: MySQL → SearXNG → Ollama
2. `~/.local/bin/unloved-launchers/launch-unloved-stack.sh` **or** start each service manually
3. `cd ~/APF && pnpm digistore24:daemon` (if using Digistore24 collection)
4. APF enrichment: `pnpm review:status` until complete
5. ShadowCast handoff from APF UI or `pnpm local:smoke-test`

---

*APF enrichment/Digistore24/scoring detail: unloved-stack-useful-commands.md. APF runbook: LOCAL_SHADOWCAST.md.*
