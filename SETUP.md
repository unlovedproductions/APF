# Affiliate Product Finder - Detailed Setup Guide

This comprehensive guide will walk you through setting up the Affiliate Product Finder application from scratch, whether you're running it locally or deploying it to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Getting API Keys](#getting-api-keys)
4. [Database Setup](#database-setup)
5. [Running the Application](#running-the-application)
6. [First Time Usage](#first-time-usage)
7. [Troubleshooting](#troubleshooting)
8. [Production Deployment](#production-deployment)

---

## Prerequisites

Before you start, make sure you have the following installed:

### Required Software

1. **Node.js** (version 22.13.0 or higher)
   - Download from: https://nodejs.org/
   - Verify installation: `node --version`

2. **pnpm** (package manager)
   - Install globally: `npm install -g pnpm`
   - Verify installation: `pnpm --version`

3. **Git** (for cloning the repository)
   - Download from: https://git-scm.com/
   - Verify installation: `git --version`

4. **MySQL or TiDB** (database)
   - Option A: Install MySQL locally from https://dev.mysql.com/downloads/mysql/
   - Option B: Use a cloud database (recommended for production)
   - Verify you can connect to your database

### Required Accounts

1. **GitHub Account** (to clone the repository)
   - Create at: https://github.com/signup

2. **WarriorPlus Account** (for WarriorPlus marketplace access)
   - Create at: https://warriorplus.com/
   - You'll need an API key (see [Getting API Keys](#getting-api-keys))

3. **Digistore24 Account** (optional, for Digistore24 marketplace)
   - Create at: https://www.digistore24.com/
   - No API key required for marketplace scraping

---

## Local Development Setup

### Step 1: Clone the Repository

Open your terminal and run:

```bash
git clone https://github.com/unlovedproductions/APF.git
cd APF
```

This creates a folder called `APF` and downloads all the project files.

### Step 2: Install Dependencies

Install all required npm packages:

```bash
pnpm install
```

This may take a few minutes. You should see output like:
```
added 500+ packages in 2m
```

### Step 3: Create Environment File

Create a `.env` file in the root directory with your database connection:

```bash
# On Mac/Linux:
cp .env.example .env

# On Windows (PowerShell):
Copy-Item .env.example .env
```

If `.env.example` doesn't exist, create `.env` manually with this content:

```env
# Database Connection
DATABASE_URL=mysql://username:password@localhost:3306/affiliate_finder

# Session Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Manus OAuth (if using Manus platform)
VITE_APP_ID=your-app-id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im

# Analytics (optional)
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=
```

### Step 4: Configure Database Connection

Edit the `.env` file and update `DATABASE_URL`:

**For Local MySQL:**
```env
DATABASE_URL=mysql://root:password@localhost:3306/affiliate_finder
```

**For Cloud Database (e.g., PlanetScale, Railway):**
```env
DATABASE_URL=mysql://username:password@host.mysql.database.azure.com:3306/affiliate_finder
```

Replace:
- `username` - your database username
- `password` - your database password
- `localhost` or `host` - your database server address
- `affiliate_finder` - your database name

### Step 5: Create Database

If you haven't created the database yet, run:

```bash
# For local MySQL
mysql -u root -p -e "CREATE DATABASE affiliate_finder;"
```

Or use your database client (MySQL Workbench, DBeaver, etc.)

### Step 6: Apply Database Migrations

Run the database migrations to create tables:

```bash
pnpm db:push
```

You should see output like:
```
✓ Migrations applied successfully
```

---

## Getting API Keys

### WarriorPlus API Key

The WarriorPlus integration requires an API key. Here's how to get it:

1. **Log in to WarriorPlus**
   - Go to: https://warriorplus.com/user/login.php
   - Enter your credentials

2. **Navigate to API Access**
   - Click your profile icon (top right)
   - Select "Account Settings"
   - Click "API Access" or "API Key"

3. **Generate API Key**
   - Click "Generate New API Key"
   - Copy the key (you'll use this in the app)

4. **Keep it Safe**
   - Don't share this key publicly
   - Don't commit it to GitHub
   - Treat it like a password

### Digistore24 (No API Key Needed)

Digistore24 marketplace scraping works without an API key. The app will automatically scrape product data from the Digistore24 marketplace.

---

## Database Setup

### Option 1: Local MySQL (Development)

**Install MySQL:**
- Download from: https://dev.mysql.com/downloads/mysql/
- Follow installation instructions for your OS

**Create Database:**
```bash
mysql -u root -p
# Enter your MySQL password when prompted

# In MySQL prompt:
CREATE DATABASE affiliate_finder;
EXIT;
```

**Update .env:**
```env
DATABASE_URL=mysql://root:your_password@localhost:3306/affiliate_finder
```

### Option 2: Cloud Database (Production Recommended)

**Using PlanetScale (MySQL-compatible):**

1. Create account at: https://planetscale.com/
2. Create a new database
3. Get connection string from "Connect" button
4. Update `.env`:
   ```env
   DATABASE_URL=mysql://[username]:[password]@[host]/affiliate_finder
   ```

**Using Railway:**

1. Create account at: https://railway.app/
2. Create new MySQL database
3. Copy connection string
4. Update `.env` with the connection string

**Using AWS RDS:**

1. Create MySQL instance in AWS console
2. Get endpoint and credentials
3. Update `.env`:
   ```env
   DATABASE_URL=mysql://admin:password@rds-endpoint.amazonaws.com:3306/affiliate_finder
   ```

---

## Running the Application

### Development Mode

Start the development server:

```bash
pnpm dev
```

You should see output like:
```
[2026-04-02T10:00:00.000Z] Server running on http://localhost:3000/
```

**Access the app:**
- Open your browser to: http://localhost:3000
- You should see the login screen

### Production Build

Build the application for production:

```bash
pnpm build
```

This creates optimized files in the `dist/` folder.

**Start production server:**

```bash
pnpm start
```

---

## First Time Usage

### Step 1: Sign In

1. Go to http://localhost:3000
2. Click "Sign In"
3. Log in with your Manus account (or create one)

### Step 2: Connect WarriorPlus (Optional)

1. Select "WarriorPlus" from the marketplace dropdown
2. Paste your WarriorPlus API key
3. Click "Connect"

### Step 3: Connect Digistore24 (Optional)

1. Select "Digistore24" from the marketplace dropdown
2. Click "Connect" (no API key needed)

### Step 4: Refresh Data

1. Click "Refresh Data" button
2. Wait for products to load (first refresh takes 1-2 minutes)
3. You should see a list of products with Hidden Gem Scores

### Step 5: Explore Products

1. Use the category filter to narrow down by niche
2. Search for specific keywords
3. Click "View" on any product to see details
4. Click the bookmark icon to save products

### Step 6: Check Bookmarks

1. Click "View Bookmarks" in the top right
2. See all your saved products
3. Update status (interested → researching → promoting → archived)

---

## Troubleshooting

### "Cannot connect to database"

**Problem:** Error message about database connection

**Solutions:**
1. Verify DATABASE_URL is correct in `.env`
2. Check database server is running
3. Verify username and password are correct
4. For cloud databases, check firewall/security groups allow your IP

```bash
# Test connection:
mysql -u username -p -h localhost -e "SELECT 1;"
```

### "Port 3000 already in use"

**Problem:** Error about port 3000 being in use

**Solutions:**
```bash
# Find process using port 3000:
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process:
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows

# Or use a different port:
PORT=3001 pnpm dev
```

### "Module not found" or dependency errors

**Problem:** Missing or broken dependencies

**Solutions:**
```bash
# Clear node_modules and reinstall:
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Or use pnpm's built-in fix:
pnpm install --force
```

### "WarriorPlus API key invalid"

**Problem:** Error when trying to connect WarriorPlus

**Solutions:**
1. Verify API key is correct (copy-paste carefully)
2. Check API key hasn't expired in WarriorPlus account
3. Try generating a new API key
4. Verify your WarriorPlus account is active

### "No products found after refresh"

**Problem:** Refresh completes but no products appear

**Solutions:**
1. Wait a few seconds and try refreshing again
2. Check that marketplace is accessible (try visiting it in browser)
3. Verify API key is valid (for WarriorPlus)
4. Check browser console for errors (F12 → Console tab)

### "Database migration failed"

**Problem:** Error when running `pnpm db:push`

**Solutions:**
```bash
# Check database connection:
mysql -u username -p -h localhost affiliate_finder

# Try generating migrations:
pnpm drizzle-kit generate

# Then apply them:
pnpm drizzle-kit migrate
```

---

## Production Deployment

### Option 1: Deploy to Manus Platform (Recommended)

1. The app is already configured for Manus
2. Click "Publish" in the Manus Management UI
3. Configure custom domain if desired
4. App will be live at your Manus URL

### Option 2: Deploy to Railway

1. Create account at: https://railway.app/
2. Connect your GitHub repository
3. Railway auto-detects Node.js project
4. Add environment variables from `.env`
5. Deploy with one click

**Steps:**
```
1. Go to railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose "unlovedproductions/APF"
5. Add environment variables
6. Click "Deploy"
```

### Option 3: Deploy to Render

1. Create account at: https://render.com/
2. Create new "Web Service"
3. Connect GitHub repository
4. Set build command: `pnpm build`
5. Set start command: `pnpm start`
6. Add environment variables
7. Deploy

### Option 4: Deploy to Vercel (Frontend Only)

**Note:** Vercel is for frontend only. You'll need a separate backend.

1. Create account at: https://vercel.com/
2. Import GitHub repository
3. Set build command: `pnpm build`
4. Deploy

### Option 5: Self-Hosted (VPS/Dedicated Server)

1. SSH into your server
2. Clone repository: `git clone https://github.com/unlovedproductions/APF.git`
3. Install Node.js and pnpm
4. Set up `.env` with production database
5. Run `pnpm install && pnpm build`
6. Use PM2 or systemd to keep app running:

```bash
# Using PM2:
npm install -g pm2
pm2 start "pnpm start" --name "apf"
pm2 startup
pm2 save
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MySQL connection string |
| `JWT_SECRET` | Yes | Secret key for session signing (use strong random string) |
| `VITE_APP_ID` | No | Manus OAuth app ID |
| `OAUTH_SERVER_URL` | No | OAuth server URL |
| `VITE_OAUTH_PORTAL_URL` | No | OAuth portal URL |
| `VITE_ANALYTICS_ENDPOINT` | No | Analytics endpoint URL |
| `VITE_ANALYTICS_WEBSITE_ID` | No | Analytics website ID |

---

## Development Tips

### Running Tests

```bash
# Run all tests:
pnpm test

# Run specific test file:
pnpm test server/warriorplus.test.ts

# Watch mode (re-run on changes):
pnpm test --watch
```

### Code Quality

```bash
# Check TypeScript:
pnpm check

# Format code:
pnpm format

# Lint (if configured):
pnpm lint
```

### Database Management

```bash
# Generate new migration:
pnpm drizzle-kit generate

# View database in browser:
pnpm drizzle-kit studio
```

---

## Next Steps

1. **Customize the app:**
   - Edit categories in `client/src/pages/Home.tsx`
   - Modify scoring algorithm in `server/warriorplus.ts`
   - Update styling in `client/src/index.css`

2. **Add features:**
   - CSV export functionality
   - Email notifications
   - Advanced filtering
   - Analytics dashboard

3. **Deploy to production:**
   - Choose hosting platform
   - Set up custom domain
   - Configure SSL certificate
   - Set up monitoring

4. **Maintain the app:**
   - Keep dependencies updated: `pnpm update`
   - Monitor database performance
   - Back up data regularly
   - Review logs for errors

---

## Getting Help

- **GitHub Issues:** https://github.com/unlovedproductions/APF/issues
- **WarriorPlus Support:** https://warriorplus.com/support
- **Digistore24 Support:** https://www.digistore24.com/support
- **Node.js Docs:** https://nodejs.org/docs/
- **MySQL Docs:** https://dev.mysql.com/doc/

---

## Security Best Practices

1. **Never commit `.env` file** to GitHub
2. **Use strong JWT_SECRET** (at least 32 random characters)
3. **Keep API keys private** (don't share in emails or chat)
4. **Use HTTPS** in production
5. **Regularly update dependencies:** `pnpm update`
6. **Enable database backups** for production
7. **Use environment variables** for all secrets
8. **Rotate API keys** periodically

---

**Happy building! 🚀**

If you have questions or run into issues, check the Troubleshooting section or open an issue on GitHub.
