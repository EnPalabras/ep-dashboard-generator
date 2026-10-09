-- Cotizaciones del dólar por día y casa (argentinadatos.com: oficial y mayorista del BCRA, blue de Ámbito,
-- MEP = "bolsa", CCL = "contadoconliqui"). Sólo días hábiles: fx_rates_calendar repite la última cotización.
CREATE TABLE IF NOT EXISTS fx_rates_daily (
  date       DATE        NOT NULL,
  casa       TEXT        NOT NULL,
  compra     NUMERIC,
  venta      NUMERIC,
  source     TEXT        NOT NULL DEFAULT 'argentinadatos',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, casa)
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_casa_date ON fx_rates_daily (casa, date);

CREATE OR REPLACE VIEW fx_rates_calendar AS
SELECT d::date AS date, c.casa, r.date AS rate_date, r.compra, r.venta
FROM (SELECT DISTINCT casa FROM fx_rates_daily) c
CROSS JOIN generate_series((SELECT min(date) FROM fx_rates_daily), current_date, interval '1 day') d
CROSS JOIN LATERAL (
  SELECT f.date, f.compra, f.venta FROM fx_rates_daily f
  WHERE f.casa = c.casa AND f.date <= d::date
  ORDER BY f.date DESC LIMIT 1
) r;
