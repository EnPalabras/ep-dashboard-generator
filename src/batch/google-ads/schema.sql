-- Google Ads — esquema
-- El costo sale de GA4 (métricas advertiserAd*), que las expone porque la cuenta
-- de Google Ads está vinculada a la property. No hace falta la API de Google Ads
-- ni su developer token: reusa la service account que ya usa el batch de GA4.
-- Refrescar con `bun run db:init` (es CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS google_ads_daily (
  date          DATE        NOT NULL,
  campaign_name TEXT        NOT NULL,   -- sessionGoogleAdsCampaignName
  cost          NUMERIC     NOT NULL DEFAULT 0,  -- advertiserAdCost
  clicks        INTEGER     NOT NULL DEFAULT 0,  -- advertiserAdClicks
  impressions   INTEGER     NOT NULL DEFAULT 0,  -- advertiserAdImpressions
  key_events    NUMERIC     NOT NULL DEFAULT 0,
  total_revenue NUMERIC     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, campaign_name)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_date ON google_ads_daily (date);
