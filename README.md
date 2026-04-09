# APF — Affiliate Product Finder

**Affiliate Product Finder (APF)** is a data-driven discovery platform designed to identify "Hidden Gem" affiliate products before they reach saturation. By analyzing sales velocity, refund rates, and market recency, APF helps affiliate marketers find high-potential products with low competition and high quality.

---

## 🚀 Key Capabilities

### 1. Multi-Marketplace Discovery
- **WarriorPlus Integration:** Direct API-level access to the latest WarriorPlus offers.
- **Digistore24 Scraping:** Real-time marketplace scraping for Digistore24 products without requiring an API key.
- **ClickBank Integration:** Added a new backend module that parses the ClickBank Marketplace XML feed and applies a custom "Hidden Gem" scoring algorithm based on gravity and sales velocity.
- **ShareASale Integration:** Implemented a secure API-based integration using SHA256 signatures. It allows you to search for merchants and evaluate them based on EPC (Earnings Per Click) and reversal rates.
- **Historical Caching:** Local database storage for tracking product performance over time.

### 2. "Hidden Gem" Scoring Algorithm
APF uses a multi-factor scoring model (0-50 pts) to rank products:
- **Recency (0-30 pts):** Higher scores for newer products to catch early traction.
- **Sales Growth (0-30 pts):** Penalizes saturated products with too many sales; rewards early-growth "sweet spots."
- **Low Competition (0-25 pts):** Measures sales-per-day velocity relative to product age.
- **Quality (0-15 pts):** Directly rewards products with low refund rates (<5%).

### 3. Product Management & Research
- **Bookmarks System:** Save high-potential products and track their status (Interested → Researching → Promoting → Archived).
- **Categorization Engine:** Automatically extracts niches (AI Tools, SEO, Finance, etc.) from keywords and metadata.
- **Detail Modal:** Deep-dive into product descriptions, vendor info, and score components.
- **Multi-Marketplace Selection:** A new dropdown in the frontend allows you to switch between WarriorPlus, Digistore24, ClickBank, and ShareASale seamlessly.

### 4. Direct Integration with ShadowCast
APF is the primary "source engine" for the **ShadowCast** video generator:
- **Batch Export:** Export your bookmarked "Hidden Gems" as a JSON package compatible with ShadowCast.
- **Live Handoff:** Launch ShadowCast directly from a product detail modal with pre-filled metadata for instant video creation.
- **Metadata Mapping:** Automatically translates product specs, pricing, and vendor info into ShadowCast-ready marketing data.

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
   # Edit .env with your DATABASE_URL and JWT_SECRET
   ```
4. **Setup Database:**
   ```bash
   pnpm db:push
   ```
5. **Launch:**
   ```bash
   pnpm dev
   ```
6. **Access:** Open `http://localhost:3000` in your browser.

---

## 🤝 Workflow Integration
1. **Find:** Use APF to discover low-competition, high-quality "Hidden Gems" on WarriorPlus/Digistore24/ClickBank/ShareASale.
2. **Bookmark:** Save the products you want to promote.
3. **Export:** Generate a ShadowCast-compatible JSON file.
4. **Create:** Import the file into **ShadowCast** to generate high-conversion review videos and SEO assets in minutes.

---

## ⚖️ License & Disclaimer
Created by **Unloved Productions**. APF is a research tool for affiliate marketers. Product performance and earnings are not guaranteed. Always verify vendor claims and follow platform terms of service.
