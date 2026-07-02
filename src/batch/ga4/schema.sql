-- GA4 (Google Analytics Data API) — esquema
-- Patrón: tablas a nivel cuenta/día, upsert idempotente. No tocan nada de Meta.
-- Refrescar con `bun run db:init` (es CREATE TABLE IF NOT EXISTS).

-- Tráfico por día × canal × source × medium.
-- channel = sessionDefaultChannelGroup de GA4 (Organic Search, Paid Social, Direct, Email, Referral, ...).
-- Sirve para comparar tráfico gratis vs pago y cruzar el "Paid Social" contra lo que reporta Meta.
CREATE TABLE IF NOT EXISTS ga4_traffic_daily (
  date                 DATE        NOT NULL,
  channel              TEXT        NOT NULL,   -- sessionDefaultChannelGroup
  source               TEXT        NOT NULL,   -- sessionSource
  medium               TEXT        NOT NULL,   -- sessionMedium
  sessions             INTEGER     NOT NULL DEFAULT 0,
  total_users          INTEGER     NOT NULL DEFAULT 0,
  new_users            INTEGER     NOT NULL DEFAULT 0,
  engaged_sessions     INTEGER     NOT NULL DEFAULT 0,
  engagement_rate      NUMERIC     NOT NULL DEFAULT 0,  -- 0..1 (proporción de sesiones con engagement)
  avg_session_duration NUMERIC     NOT NULL DEFAULT 0,  -- segundos
  conversions          NUMERIC     NOT NULL DEFAULT 0,  -- key events / conversiones del período
  total_revenue        NUMERIC     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, channel, source, medium)
);

CREATE INDEX IF NOT EXISTS idx_ga4_traffic_date ON ga4_traffic_daily (date);
CREATE INDEX IF NOT EXISTS idx_ga4_traffic_channel ON ga4_traffic_daily (channel);

-- Eventos (key events / conversiones) por día × nombre de evento.
-- Para ver qué dispara: purchase, add_to_cart, begin_checkout, etc., y cruzarlos con Meta.
CREATE TABLE IF NOT EXISTS ga4_events_daily (
  date        DATE        NOT NULL,
  event_name  TEXT        NOT NULL,
  event_count INTEGER     NOT NULL DEFAULT 0,
  conversions NUMERIC     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, event_name)
);

CREATE INDEX IF NOT EXISTS idx_ga4_events_date ON ga4_events_daily (date);
