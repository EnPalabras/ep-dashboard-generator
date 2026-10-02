-- Mercado Libre Product Ads — una fila por campaña × día. Sólo en la base de v2.
-- La API de ML devuelve los últimos ~90 días; lo anterior quedó en combined_report_by_day (copia de Windsor).
CREATE TABLE IF NOT EXISTS mercadolibre_ads_daily (
  date             DATE        NOT NULL,
  campaign_id      BIGINT      NOT NULL,
  campaign_name    TEXT,
  cost             NUMERIC     NOT NULL DEFAULT 0,
  prints           INTEGER     NOT NULL DEFAULT 0,
  clicks           INTEGER     NOT NULL DEFAULT 0,
  direct_amount    NUMERIC     NOT NULL DEFAULT 0,
  indirect_amount  NUMERIC     NOT NULL DEFAULT 0,
  total_amount     NUMERIC     NOT NULL DEFAULT 0,
  units_quantity   INTEGER     NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_mercadolibre_ads_date ON mercadolibre_ads_daily (date);
