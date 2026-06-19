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
  ctr NUMERIC(7, 4) DEFAULT 0,
  cpc NUMERIC(10, 2) DEFAULT 0,
  objective TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (campaign_id, adset_id, ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_date ON meta_campaign_insights(date);
CREATE INDEX IF NOT EXISTS idx_meta_insights_campaign ON meta_campaign_insights(campaign_id);

-- frequency/purchase_roas se guardan por fila pero NO se suman entre anuncios ni días.
ALTER TABLE meta_campaign_insights ADD COLUMN IF NOT EXISTS frequency NUMERIC(10, 4) DEFAULT 0;
ALTER TABLE meta_campaign_insights ADD COLUMN IF NOT EXISTS purchase_roas NUMERIC(12, 4) DEFAULT 0;
ALTER TABLE meta_campaign_insights ADD COLUMN IF NOT EXISTS omni_purchase INTEGER DEFAULT 0;
ALTER TABLE meta_campaign_insights ADD COLUMN IF NOT EXISTS omni_purchase_value NUMERIC(14, 2) DEFAULT 0;

-- effective_status viene de /ads (no de /insights). Una fila por anuncio, se sobrescribe cada corrida.
CREATE TABLE IF NOT EXISTS meta_ad_entities (
  ad_id            TEXT PRIMARY KEY,
  ad_name          TEXT,
  campaign_id      TEXT,
  campaign_name    TEXT,
  adset_id         TEXT,
  effective_status TEXT,
  updated_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meta_ad_entities_campaign ON meta_ad_entities(campaign_id);

-- Nivel cuenta: reach/frequency desduplicados por día por Meta (no se suman desde anuncios).
CREATE TABLE IF NOT EXISTS meta_account_daily (
  account_id          TEXT NOT NULL,
  date                DATE NOT NULL,
  amount_spent        NUMERIC(14, 2) DEFAULT 0,
  impressions         BIGINT        DEFAULT 0,
  reach               BIGINT        DEFAULT 0,
  frequency           NUMERIC(10, 4) DEFAULT 0,
  ctr                 NUMERIC(7, 4)  DEFAULT 0,
  cpm                 NUMERIC(10, 2) DEFAULT 0,
  purchase_roas       NUMERIC(12, 4) DEFAULT 0,
  omni_purchase       INTEGER        DEFAULT 0,
  omni_purchase_value NUMERIC(14, 2) DEFAULT 0,
  updated_at          TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (account_id, date)
);
CREATE INDEX IF NOT EXISTS idx_meta_account_daily_date ON meta_account_daily(date);

-- Nivel cuenta por ventana: reach/frequency no se pueden sumar de los diarios; cada ventana es un pedido aparte.
CREATE TABLE IF NOT EXISTS meta_account_totals (
  account_id          TEXT NOT NULL,
  window_label        TEXT NOT NULL,   -- 'last_7d', 'last_28d', 'mtd'
  period_from         DATE NOT NULL,
  period_to           DATE NOT NULL,
  amount_spent        NUMERIC(14, 2) DEFAULT 0,
  reach               BIGINT        DEFAULT 0,
  impressions         BIGINT        DEFAULT 0,
  frequency           NUMERIC(10, 4) DEFAULT 0,
  ctr                 NUMERIC(7, 4)  DEFAULT 0,
  cpm                 NUMERIC(10, 2) DEFAULT 0,
  purchase_roas       NUMERIC(12, 4) DEFAULT 0,
  omni_purchase       INTEGER        DEFAULT 0,
  omni_purchase_value NUMERIC(14, 2) DEFAULT 0,
  computed_at         TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (account_id, window_label)
);

-- Dashboard registry
CREATE TABLE IF NOT EXISTS dashboards (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file TEXT NOT NULL,
  created_at DATE NOT NULL DEFAULT CURRENT_DATE
);
