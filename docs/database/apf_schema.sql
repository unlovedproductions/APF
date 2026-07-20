-- Consolidated APF schema (analyzer-compatible DDL, no backticks)

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    openId VARCHAR(64) NOT NULL UNIQUE,
    name TEXT,
    email VARCHAR(320),
    loginMethod VARCHAR(64),
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_credentials (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    userId INTEGER NOT NULL,
    platform VARCHAR(32) NOT NULL,
    apiKey TEXT NOT NULL,
    isActive BOOLEAN NOT NULL DEFAULT true,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    userId INTEGER NOT NULL,
    platform VARCHAR(32) NOT NULL,
    platformProductId VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    vendor VARCHAR(255),
    category VARCHAR(255),
    keywords TEXT,
    description TEXT,
    saleCount INTEGER DEFAULT 0,
    aggregateSales DECIMAL(12,2) DEFAULT 0,
    refundCount INTEGER DEFAULT 0,
    commissionRate DECIMAL(5,2),
    conversionRate DECIMAL(5,2),
    cartValue DECIMAL(12,2),
    commissionType VARCHAR(32),
    affiliateLink TEXT,
    hiddenGemScore DECIMAL(5,2) DEFAULT 0,
    scoreComponents TEXT,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    platformCreatedAt TIMESTAMP,
    lastUpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    dataFetchedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(userId, platform, platformProductId)
);

CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    userId INTEGER NOT NULL,
    productId INTEGER NOT NULL,
    notes TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'interested',
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(userId, productId)
);

CREATE TABLE data_refresh_log (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    userId INTEGER NOT NULL,
    platform VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    productsCount INTEGER DEFAULT 0,
    errorMessage TEXT,
    startedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completedAt TIMESTAMP
);

CREATE TABLE product_affiliate_links (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    product_id INTEGER NOT NULL,
    provider VARCHAR(32) NOT NULL,
    affiliate_nickname VARCHAR(100) NOT NULL,
    vendor_nickname VARCHAR(100),
    platform_product_id VARCHAR(100),
    affiliate_url TEXT NOT NULL,
    campaign_key VARCHAR(120),
    status VARCHAR(32) NOT NULL DEFAULT 'generated',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, provider, affiliate_nickname)
);

CREATE TABLE product_review_sources (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    product_id INTEGER NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    source_name VARCHAR(255),
    title TEXT,
    url VARCHAR(2048) NOT NULL,
    snippet TEXT,
    published_at TIMESTAMP,
    discovered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    relevance_score DECIMAL(5,2),
    trust_score DECIMAL(5,2),
    sentiment VARCHAR(32),
    raw_json JSON,
    UNIQUE(product_id, url)
);

CREATE TABLE product_review_briefs (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    product_id INTEGER NOT NULL UNIQUE,
    enrichment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    review_summary TEXT,
    positive_signals JSON,
    negative_signals JSON,
    common_claims JSON,
    common_complaints JSON,
    target_audience TEXT,
    who_it_may_help TEXT,
    who_should_skip_it TEXT,
    best_video_angles JSON,
    cta_guidance TEXT,
    recommended_content_style TEXT,
    suggested_competitors JSON,
    price_display TEXT,
    price_comparison TEXT,
    series_name TEXT,
    coupon_code TEXT,
    evidence_coverage JSON,
    source_count INTEGER NOT NULL DEFAULT 0,
    confidence_score DECIMAL(5,2),
    error_message TEXT,
    generated_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE review_enrichment_jobs (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    product_id INTEGER NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_vendor_materials (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    product_id INTEGER NOT NULL,
    source_url TEXT NOT NULL,
    source_url_hash VARCHAR(64) NOT NULL,
    source_type VARCHAR(64) NOT NULL,
    domain VARCHAR(255),
    title TEXT,
    content_text TEXT,
    structured_blocks JSON,
    is_vendor_hosted BOOLEAN NOT NULL DEFAULT true,
    fetch_status VARCHAR(32) NOT NULL DEFAULT 'ok',
    discovered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, source_url_hash)
);

CREATE TABLE vendor_profiles (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    platform VARCHAR(32) NOT NULL,
    vendor_name VARCHAR(255) NOT NULL,
    vendor_name_normalized VARCHAR(255) NOT NULL,
    bbb_signals JSON,
    trustpilot_signals JSON,
    scam_advisor_signals JSON,
    review_signals JSON,
    complaint_signals JSON,
    source_count INTEGER NOT NULL DEFAULT 0,
    vendor_trust_score DECIMAL(5,2) NOT NULL DEFAULT 40,
    vendor_risk_flags JSON,
    ranking_components JSON,
    last_enriched_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform, vendor_name_normalized)
);

CREATE INDEX idx_products_user_platform_score ON products (userId, platform, hiddenGemScore);
CREATE INDEX idx_products_category ON products (userId, platform, category);
CREATE INDEX idx_api_credentials_user_platform ON api_credentials (userId, platform);
CREATE INDEX idx_bookmarks_user ON bookmarks (userId);
CREATE INDEX idx_data_refresh_user_platform ON data_refresh_log (userId, platform);
CREATE INDEX idx_product_affiliate_links_product ON product_affiliate_links (product_id);
CREATE INDEX idx_product_affiliate_links_provider ON product_affiliate_links (provider);
CREATE INDEX idx_product_affiliate_links_status ON product_affiliate_links (status);
CREATE INDEX idx_product_review_sources_product ON product_review_sources (product_id);
CREATE INDEX idx_product_review_sources_type ON product_review_sources (source_type);
CREATE INDEX idx_review_briefs_status ON product_review_briefs (enrichment_status);
CREATE INDEX idx_review_briefs_confidence ON product_review_briefs (confidence_score);
CREATE INDEX idx_review_jobs_queue ON review_enrichment_jobs (status, next_run_at);
CREATE INDEX idx_vendor_materials_product ON product_vendor_materials (product_id);
CREATE INDEX idx_vendor_materials_type ON product_vendor_materials (source_type);
