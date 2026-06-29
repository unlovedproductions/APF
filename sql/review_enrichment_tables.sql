CREATE TABLE IF NOT EXISTS product_review_sources (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  source_name VARCHAR(255),
  title TEXT,
  url TEXT NOT NULL,
  snippet TEXT,
  published_at DATETIME NULL,
  discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  relevance_score DECIMAL(5,2),
  trust_score DECIMAL(5,2),
  sentiment VARCHAR(32),
  raw_json JSON,
  UNIQUE KEY uq_product_review_url (product_id, url(255)),
  INDEX idx_product_review_sources_product (product_id),
  INDEX idx_product_review_sources_type (source_type),
  INDEX idx_product_review_sources_score (product_id, relevance_score, trust_score)
);

CREATE TABLE IF NOT EXISTS product_review_briefs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL UNIQUE,
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
  source_count INT NOT NULL DEFAULT 0,
  confidence_score DECIMAL(5,2),
  error_message TEXT,
  generated_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_review_briefs_status (enrichment_status),
  INDEX idx_review_briefs_confidence (confidence_score)
);

CREATE TABLE IF NOT EXISTS review_enrichment_jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  next_run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME NULL,
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_job_product (product_id),
  INDEX idx_review_jobs_queue (status, next_run_at)
);
