-- TikTok Ads — una fila por anuncio × día. Tabla nuestra (ep_analytics la posee).
CREATE TABLE IF NOT EXISTS tiktok_ads_daily (
  date            DATE        NOT NULL,
  ad_id           TEXT        NOT NULL,
  ad_name         TEXT,
  campaign_name   TEXT,
  adgroup_name    TEXT,
  spend           NUMERIC     NOT NULL DEFAULT 0,
  impressions     INTEGER     NOT NULL DEFAULT 0,
  clicks          INTEGER     NOT NULL DEFAULT 0,
  ctr             NUMERIC     NOT NULL DEFAULT 0,
  cpc             NUMERIC     NOT NULL DEFAULT 0,
  cpm             NUMERIC     NOT NULL DEFAULT 0,
  conversion      NUMERIC     NOT NULL DEFAULT 0,
  conversion_rate NUMERIC     NOT NULL DEFAULT 0,
  reach           INTEGER     NOT NULL DEFAULT 0,
  likes           INTEGER     NOT NULL DEFAULT 0,
  comments        INTEGER     NOT NULL DEFAULT 0,
  shares          INTEGER     NOT NULL DEFAULT 0,
  profile_visits  INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_tiktok_ads_date ON tiktok_ads_daily (date);
