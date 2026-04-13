# APF - Linux Setup Instructions

This document provides comprehensive instructions for setting up the Affiliate Product Finder (APF) application on a Linux environment. APF is a data-driven platform designed to help affiliate marketers discover high-potential products by analyzing various metrics across multiple marketplaces.

## Table of Contents

1.  [Prerequisites](#prerequisites)
2.  [Setup Steps](#setup-steps)
    *   [Clone the Repository](#clone-the-repository)
    *   [Install Dependencies](#install-dependencies)
    *   [Environment Configuration](#environment-configuration)
    *   [Database Setup](#database-setup)
    *   [API Keys](#api-keys)
    *   [Running the Application](#running-the-application)
3.  [First Time Usage](#first-time-usage)
4.  [Troubleshooting](#troubleshooting)
5.  [References](#references)

---

## Prerequisites

Before proceeding with the setup, ensure you have the following software installed and accounts ready:

### Required Software

*   **Node.js** (version 22.13.0 or higher) [1]
    *   Verify installation: `node --version`
*   **pnpm** (package manager) [2]
    *   Install globally: `npm install -g pnpm`
    *   Verify installation: `pnpm --version`
*   **Git** (for cloning the repository) [3]
    *   Verify installation: `git --version`
*   **MySQL or TiDB** (database) [4]
    *   Install MySQL locally or use a cloud-based solution. Ensure you can connect to your database.

### Required Accounts

*   **GitHub Account** (to clone the repository) [5]
*   **WarriorPlus Account** (for WarriorPlus marketplace access) [6]
    *   You will need an API key from WarriorPlus.
*   **Digistore24 Account** (optional, for Digistore24 marketplace) [7]
    *   No API key is required for marketplace scraping.

---

## Setup Steps

### Clone the Repository

Open your terminal and clone the APF repository. If the repository is private, you will need to use a Personal Access Token (PAT) for authentication.

```bash
git clone https://github.com/unlovedproductions/APF.git
cd APF
```

If you are cloning a private repository and need to use a PAT, the command would look like this (replace `YOUR_PAT` with your actual token):

```bash
git clone https://YOUR_PAT@github.com/unlovedproductions/APF.git
cd APF
```

### Install Dependencies

Navigate into the `APF` directory and install all required pnpm packages:

```bash
pnpm install
```

This process may take a few minutes.

### Environment Configuration

APF requires several environment variables to be set. Create a `.env` file in the root directory of the project. Note that there is no `.env.example` file in the repository, so you will need to create this file manually.

Create the `.env` file:

```bash
touch .env
```

Edit the `.env` file and add the following content, replacing the placeholder values with your actual configuration:

```env
# Database Connection
DATABASE_URL="mysql://username:password@localhost:3306/affiliate_finder"

# Session Security
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# Manus OAuth (if using Manus platform - optional)
VITE_APP_ID="your-app-id"
OAUTH_SERVER_URL="https://api.manus.im"
VITE_OAUTH_PORTAL_URL="https://portal.manus.im"

# Built-in Forge API (optional, for advanced integrations)
BUILT_IN_FORGE_API_URL=""
BUILT_IN_FORGE_API_KEY=""

# Analytics (optional)
VITE_ANALYTICS_ENDPOINT=""
VITE_ANALYTICS_WEBSITE_ID=""
```

**Important:**
*   `DATABASE_URL` is mandatory for database operations.
*   `JWT_SECRET` should be a strong, randomly generated string for production environments.
*   The `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` are used for optional external service integrations. If not provided, some features may not function.

### Database Setup

1.  **Create Database:** If you haven't already, create the `affiliate_finder` database in your MySQL/TiDB instance. For local MySQL, you can use:

    ```bash
    mysql -u root -p -e "CREATE DATABASE affiliate_finder;"
    ```

    Replace `root` with your MySQL username and enter your password when prompted.

2.  **Apply Database Migrations:** Run the Drizzle migrations to create the necessary tables in your database:

    ```bash
    pnpm db:push
    ```

    You should see a success message indicating that migrations have been applied.

### API Keys

#### WarriorPlus API Key

To integrate with WarriorPlus, you need an API key:

1.  **Log in to WarriorPlus:** Go to [https://warriorplus.com/user/login.php](https://warriorplus.com/user/login.php) [6].
2.  **Navigate to API Access:** Click your profile icon (top right), select 
"Account Settings", and then click "API Access" or "API Key".
3.  **Generate API Key:** Click "Generate New API Key" and copy the generated key. You will use this in the application.
4.  **Keep it Safe:** Do not share this key publicly or commit it to your repository.

#### Digistore24 (No API Key Needed)

Digistore24 marketplace scraping works without an API key. The application will automatically scrape product data from the Digistore24 marketplace.

### Running the Application

#### Development Mode

To start the application in development mode, run:

```bash
pnpm dev
```

This will start the server, typically on `http://localhost:3000/`. You can access the application by opening this URL in your web browser.

#### Production Build

To build the application for production:

```bash
pnpm build
```

This command creates optimized files in the `dist/` folder. To start the production server, run:

```bash
pnpm start
```

---

## First Time Usage

1.  **Sign In:** Open `http://localhost:3000` in your browser, click "Sign In", and log in with your Manus account (or create one).
2.  **Connect Marketplaces (Optional):**
    *   **WarriorPlus:** Select "WarriorPlus" from the marketplace dropdown, paste your API key, and click "Connect."
    *   **Digistore24:** Select "Digistore24" and click "Connect" (no API key needed).
3.  **Refresh Data:** Click the "Refresh Data" button. The initial refresh may take 1-2 minutes to load products.
4.  **Explore Products:** Use filters, search, and view product details. Bookmark products of interest.
5.  **Check Bookmarks:** View your saved products and update their status (Interested → Researching → Promoting → Archived).

---

## Troubleshooting

*   **"Cannot connect to database"**: Verify `DATABASE_URL` in `.env`, ensure the database server is running, and check credentials. For cloud databases, confirm firewall/security group rules.
*   **"Port 3000 already in use"**: Find and kill the process using port 3000 (e.g., `lsof -i :3000` on Linux) or start the application on a different port (e.g., `PORT=3001 pnpm dev`).
*   **"Module not found" or dependency errors**: Clear `node_modules` and `pnpm-lock.yaml`, then reinstall dependencies (`rm -rf node_modules pnpm-lock.yaml && pnpm install`).
*   **"WarriorPlus API key invalid"**: Double-check the API key, ensure it hasn't expired, or generate a new one.
*   **"No products found after refresh"**: Allow time for refresh, verify marketplace accessibility, check API key validity (for WarriorPlus), and inspect the browser console for errors.
*   **"Database migration failed"**: Verify database connection. Try generating migrations (`pnpm drizzle-kit generate`) and then applying them (`pnpm drizzle-kit migrate`).

---

## References

[1] Node.js Official Website: [https://nodejs.org/](https://nodejs.org/)
[2] pnpm Official Website: [https://pnpm.io/](https://pnpm.io/)
[3] Git Official Website: [https://git-scm.com/](https://git-scm.com/)
[4] MySQL Official Website: [https://dev.mysql.com/downloads/mysql/](https://dev.mysql.com/downloads/mysql/)
[5] GitHub Official Website: [https://github.com/](https://github.com/)
[6] WarriorPlus Official Website: [https://warriorplus.com/](https://warriorplus.com/)
[7] Digistore24 Official Website: [https://www.digistore24.com/](https://www.digistore24.com/)
