# APF — Affiliate Product Finder

**Affiliate Product Finder (APF)** is a data-driven discovery platform designed to identify "Hidden Gem" affiliate products before they reach saturation. By analyzing sales velocity, refund rates, and market recency, APF helps affiliate marketers find high-potential products with low competition and high quality.

---

## 🚀 Key Capabilities

### 1. Multi-Marketplace Discovery
- **WarriorPlus Integration:** Direct API-level access to the latest WarriorPlus offers.
- **Digistore24 (Firefox daemon):** Logged-in Firefox session collects affiliate marketplace products, promotes/extracts account-tied promolinks when possible, and scores them with `digistore24_native_v1` (no Digistore REST API key required for this path).
- **ClickBank Integration:** Added a new backend module that parses the ClickBank Marketplace XML feed and applies a custom "Hidden Gem" scoring algorithm based on gravity and sales velocity.
- **ShareASale Integration:** Implemented a secure API-based integration using SHA256 signatures. It allows you to search for merchants and evaluate them based on EPC (Earnings Per Click) and reversal rates.
- **Historical Caching:** Local database storage for tracking product performance over time.

### 2. "Hidden Gem" Scoring Algorithm
Marketplace scorers differ by platform:
- **WarriorPlus:** Recency / growth / competition / quality from sales and refund signals.
- **Digistore24 (`digistore24_native_v1`):** Heuristic 0–100 score from structured marketplace fields + affiliate readiness + enrichment confidence (not full Digistore sales/refund history).
- **ClickBank / ShareASale:** Gravity, velocity, EPC, and reversal-oriented signals as implemented in each client.

### 3. Product Management & Research
- **Bookmarks System:** Save high-potential products and track their status (Interested → Researching → Promoting → Archived).
- **Categorization Engine:** Automatically extracts niches (AI Tools, SEO, Finance, etc.) from keywords and metadata.
- **Detail Modal:** Deep-dive into product descriptions, vendor info, and score components.
- **Multi-Marketplace Selection:** A new dropdown in the frontend allows you to switch between WarriorPlus, Digistore24, ClickBank, and ShareASale seamlessly.

### 4. Direct Integration with ShadowCast
APF is the primary "source engine" for the **ShadowCast** video generator:
- **Enriched payload:** `apf_shadowcast_enriched_v1` via `POST /api/import-apf/direct` (shared `INTERNAL_SERVICE_SECRET`).
- **UI handoff:** Product detail **Send to ShadowCast** and batch export return draft `open_url`s.
- **Review enrichment:** SearXNG + Ollama fill briefs/sources before a full handoff (see `LOCAL_SHADOWCAST.md`).
- **JSON export:** CLI/UI export still available when you want a file instead of live import.

---

## 📚 Operational Documentation

- `CHANGELOG.md` — notable changes (Keep a Changelog)
- `docs/RECOVERY.md` — disaster-recovery playbook (new machine, tree corruption, DB loss)
- `docs/RUNBOOK.md` — startup/shutdown and day-to-day operations
- `docs/ARCHITECTURE.md` — system map and data flow
- `docs/enrichment-improvements.md` — review-enrichment action plan and progress
- `docs/unloved-stack-useful-commands/unloved-stack-useful-commands.md` — APF enrichment/Digistore24/ShadowCast handoff commands (PDF in same folder)
- `docs/unloved-stack-useful-commands/unloved-full-stack-commands.md` — full stack + desktop launchers (PDF in same folder)

---

## 🛠 Tech Stack
- **Frontend:** React + TypeScript + TailwindCSS (Vite)
- **Backend:** Node.js (tRPC)
- **Database:** MySQL / TiDB (Drizzle ORM)
- **Auth:** Manus OAuth (OpenID Connect)
- **Deployment:** Optimized for Manus, Railway, or Render.

---

## 📦 Installation & Setup

### Prerequisites
- Node.js 22.13.0+
- pnpm (Package Manager)
- MySQL or TiDB Database

### Quick Start
1. **Clone the repo:**
   ```bash
   git clone https://github.com/unlovedproductions/APF.git
   cd APF
   ```
2. **Install Dependencies:**
   ```bash
   pnpm install
   ```
3. **Configure Environment:**
   ```bash
   cp .env.example .env
   # Edit .env: DATABASE_URL, JWT_SECRET, DIGISTORE24_ID, SHADOWCAST_BASE_URL, INTERNAL_SERVICE_SECRET
   ```
4. **Setup Database:**
   ```bash
   pnpm db:push
   ```
5. **Launch (local Digistore → ShadowCast path):**
   ```bash
   pnpm local:start          # APF
   pnpm digistore24:daemon   # Firefox collector (login when prompted)
   # ShadowCast on :8000; optional SearXNG + Ollama for enrichment — see LOCAL_SHADOWCAST.md
   ```
   Or `pnpm dev` for APF alone.
6. **Access:** Open `http://localhost:3000` in your browser.

---

## 🤝 Workflow Integration
1. **Find:** Refresh Digistore24 (logged-in Firefox daemon) or other marketplaces; sort by Hidden Gem score.
2. **Enrich:** Wait for review enrichment `complete` on products you care about.
3. **Send:** Use **Send to ShadowCast** (or `pnpm local:smoke-test`) so drafts open in ShadowCast with affiliate + enrichment fields.
4. **Create:** Generate videos in ShadowCast from those drafts.

---

## ⚖️ License & Disclaimer
Created by **Unloved Productions**. APF is a research tool for affiliate marketers. Product performance and earnings are not guaranteed. Always verify vendor claims and follow platform terms of service.
