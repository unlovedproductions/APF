#!/usr/bin/env node
import fs from 'node:fs'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import mysql from 'mysql2/promise'

function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue

    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }

    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}

loadEnv()

const DATABASE_URL = process.env.DATABASE_URL
const DIGISTORE24_ID = process.env.DIGISTORE24_ID || 'UnlovedProducts'
const PROMO_BASE = (process.env.DIGISTORE24_PROMOLINK_BASE_URL || 'https://www.checkout-ds24.com/redir').replace(/\/+$/, '')
const CAMPAIGN_PREFIX = process.env.DIGISTORE24_CAMPAIGN_PREFIX || 'apf'

if (!DATABASE_URL) {
  console.error('DATABASE_URL missing from APF .env')
  process.exit(1)
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1] || fallback
}

function clean(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function extractProductId(value) {
  const text = String(value || '')

  for (const pattern of [
    /checkout-ds24\.com\/redir\/(\d+)/i,
    /digistore24\.com\/product\/(\d+)/i,
    /\/redir\/(\d+)\//i,
    /[?&]product_id=(\d+)/i,
    /[?&]product=(\d+)/i,
    /^(\d+)$/
  ]) {
    const m = text.match(pattern)
    if (m) return m[1]
  }

  return ''
}

function campaignKey(productId) {
  return `${CAMPAIGN_PREFIX}_${String(productId).replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 80)
}

function generatedPromolink(productId) {
  return `${PROMO_BASE}/${encodeURIComponent(productId)}/${encodeURIComponent(DIGISTORE24_ID)}/${encodeURIComponent(campaignKey(productId))}`
}

async function firstUserId(conn) {
  try {
    const [rows] = await conn.query('SELECT id FROM users ORDER BY createdAt ASC LIMIT 1')
    return rows[0]?.id || null
  } catch {
    return null
  }
}

async function columns(conn, table) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``)
  return rows.map(r => r.Field)
}

async function ensureAffiliateTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS product_affiliate_links (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT NOT NULL,
      provider VARCHAR(32) NOT NULL,
      affiliate_nickname VARCHAR(100) NOT NULL,
      vendor_nickname VARCHAR(100),
      platform_product_id VARCHAR(100),
      affiliate_url TEXT NOT NULL,
      campaign_key VARCHAR(120),
      status VARCHAR(32) NOT NULL DEFAULT 'approved',
      notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_product_provider_affiliate (product_id, provider, affiliate_nickname),
      INDEX idx_product_affiliate_links_product (product_id),
      INDEX idx_product_affiliate_links_provider (provider),
      INDEX idx_product_affiliate_links_status (status)
    )
  `)
}

async function queueReview(conn, productId) {
  try {
    await conn.query(`
      INSERT INTO review_enrichment_jobs (product_id, status, next_run_at)
      VALUES (?, 'queued', NOW())
      ON DUPLICATE KEY UPDATE
        status = CASE
          WHEN status IN ('complete','failed','pending_api_key') THEN 'queued'
          ELSE status
        END,
        next_run_at = NOW(),
        updated_at = NOW()
    `, [productId])
  } catch {}
}

async function main() {
  let url = arg('--url')
  let name = arg('--name')
  let vendor = arg('--vendor', 'digistore24')
  let category = arg('--category', 'Digistore24')
  let description = arg('--description', '')

  if (!url || !name) {
    const rl = readline.createInterface({ input, output })

    if (!url) {
      url = await rl.question('Paste Digistore24 promolink or product URL: ')
    }

    if (!name) {
      name = await rl.question('Product name: ')
    }

    const v = await rl.question(`Vendor [${vendor}]: `)
    if (v.trim()) vendor = v.trim()

    const c = await rl.question(`Category [${category}]: `)
    if (c.trim()) category = c.trim()

    const d = await rl.question('Short description, optional: ')
    if (d.trim()) description = d.trim()

    rl.close()
  }

  url = clean(url, 2000)
  name = clean(name, 255)
  vendor = clean(vendor, 255)
  category = clean(category, 255)
  description = clean(description, 2000)

  const platformProductId = extractProductId(url)

  if (!platformProductId) {
    console.error('Could not find a Digistore24 product ID in that URL.')
    console.error('Expected something like: https://www.checkout-ds24.com/redir/123456/UnlovedProducts/apf_123456')
    process.exit(1)
  }

  const affiliateLink = url.includes('checkout-ds24.com/redir/')
    ? url
    : generatedPromolink(platformProductId)

  const conn = await mysql.createConnection(DATABASE_URL)

  try {
    await ensureAffiliateTable(conn)

    const productColumns = await columns(conn, 'products')

    const [existing] = await conn.query(`
      SELECT id
      FROM products
      WHERE platform='digistore24' AND platformProductId=?
      LIMIT 1
    `, [platformProductId])

    let productId

    if (existing.length) {
      productId = existing[0].id

      await conn.query(`
        UPDATE products
        SET name=?, vendor=?, category=?, description=?, affiliateLink=?, keywords=?, lastUpdatedAt=NOW()
        WHERE id=?
      `, [
        name,
        vendor,
        category,
        description,
        affiliateLink,
        `${name}, ${category}, Digistore24, review, pros and cons`,
        productId
      ])
    } else {
      const data = {
        platform: 'digistore24',
        platformProductId,
        name,
        vendor,
        category,
        keywords: `${name}, ${category}, Digistore24, review, pros and cons`,
        description,
        saleCount: 0,
        aggregateSales: 0,
        refundCount: 0,
        commissionRate: null,
        commissionType: 'affiliate',
        affiliateLink,
        hiddenGemScore: 0,
        scoreComponents: JSON.stringify({
          marketplace: 'digistore24',
          source: 'manual_promolink_intake',
          affiliate_id: DIGISTORE24_ID
        }),
        createdAt: new Date(),
        platformCreatedAt: new Date(),
        lastUpdatedAt: new Date()
      }

      if (productColumns.includes('userId')) {
        const userId = await firstUserId(conn)
        if (!userId) throw new Error('products.userId exists but no users row was found. Open/login to APF once, then rerun.')
        data.userId = userId
      }

      const keys = Object.keys(data).filter(k => productColumns.includes(k))
      const placeholders = keys.map(() => '?').join(', ')
      const sql = `INSERT INTO products (${keys.map(k => `\`${k}\``).join(', ')}) VALUES (${placeholders})`

      const [result] = await conn.query(sql, keys.map(k => data[k]))
      productId = result.insertId
    }

    await conn.query(`
      INSERT INTO product_affiliate_links
      (product_id, provider, affiliate_nickname, vendor_nickname, platform_product_id, affiliate_url, campaign_key, status, notes)
      VALUES (?, 'digistore24', ?, ?, ?, ?, ?, 'approved', 'Imported from Digistore24 promolink')
      ON DUPLICATE KEY UPDATE
        vendor_nickname=VALUES(vendor_nickname),
        platform_product_id=VALUES(platform_product_id),
        affiliate_url=VALUES(affiliate_url),
        campaign_key=VALUES(campaign_key),
        status='approved',
        notes=VALUES(notes),
        updated_at=NOW()
    `, [
      productId,
      DIGISTORE24_ID,
      vendor,
      platformProductId,
      affiliateLink,
      campaignKey(platformProductId)
    ])

    await queueReview(conn, productId)

    console.log('')
    console.log('Saved Digistore24 product into APF.')
    console.table([{
      apf_product_id: productId,
      platformProductId,
      name,
      vendor,
      category,
      affiliateLink
    }])
    console.log('')
    console.log('Review enrichment queued.')
    console.log('')
    console.log('Next:')
    console.log(`  pnpm run review:once`)
    console.log(`  pnpm run shadowcast:send ${productId} --open`)
  } finally {
    await conn.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
