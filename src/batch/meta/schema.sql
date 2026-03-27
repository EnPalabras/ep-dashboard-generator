-- Meta Ads raw data tables
-- This schema will be refined once specific Meta API fields are confirmed

CREATE TABLE IF NOT EXISTS meta_campaign_insights (
  id SERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  date DATE NOT NULL,
  spend NUMERIC(12, 2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  cpm NUMERIC(10, 2) DEFAULT 0,
  cpp NUMERIC(10, 2) DEFAULT 0,
  ctr NUMERIC(6, 4) DEFAULT 0,
  cpc NUMERIC(10, 2) DEFAULT 0,
  objective TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (campaign_id, adset_id, ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_date ON meta_campaign_insights(date);
CREATE INDEX IF NOT EXISTS idx_meta_insights_campaign ON meta_campaign_insights(campaign_id);
