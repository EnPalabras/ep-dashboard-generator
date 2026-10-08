-- Google Search Console (Search Analytics API) — esquema
-- Propiedad sc-domain:enpalabras.com.ar, leída con la misma service account que GA4.
-- Sólo en v2 (DATABASE_URL_SECONDARY): el legacy no la tiene.
-- Refrescar con `bun run db:init` (es CREATE TABLE IF NOT EXISTS).
--
-- Tres tablas porque Google anonimiza las búsquedas poco frecuentes, y en cuanto se
-- pide la página junto con país o dispositivo esas filas desaparecen (~la mitad de
-- los clicks). Completas: gsc_site_daily (país × dispositivo) y gsc_page_daily (sólo
-- página; suma un poco más que el sitio porque Google cuenta por página). Parcial:
-- gsc_query_daily, para keywords.
-- search_type: 'web' | 'image'. position = posición promedio (1 = primer resultado).

CREATE TABLE IF NOT EXISTS gsc_site_daily (
  date        DATE        NOT NULL,
  search_type TEXT        NOT NULL,
  country     TEXT        NOT NULL,   -- ISO 3166-1 alfa-3, en minúscula (arg, ury, ...)
  device      TEXT        NOT NULL,   -- DESKTOP | MOBILE | TABLET
  clicks      INTEGER     NOT NULL DEFAULT 0,
  impressions INTEGER     NOT NULL DEFAULT 0,
  ctr         NUMERIC     NOT NULL DEFAULT 0,
  position    NUMERIC     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, search_type, country, device)
);

CREATE TABLE IF NOT EXISTS gsc_page_daily (
  date        DATE        NOT NULL,
  search_type TEXT        NOT NULL,
  page        TEXT        NOT NULL,
  clicks      INTEGER     NOT NULL DEFAULT 0,
  impressions INTEGER     NOT NULL DEFAULT 0,
  ctr         NUMERIC     NOT NULL DEFAULT 0,
  position    NUMERIC     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, search_type, page)
);

CREATE INDEX IF NOT EXISTS idx_gsc_page_date ON gsc_page_daily (date);

CREATE TABLE IF NOT EXISTS gsc_query_daily (
  date        DATE        NOT NULL,
  search_type TEXT        NOT NULL,
  query       TEXT        NOT NULL,
  page        TEXT        NOT NULL,
  country     TEXT        NOT NULL,
  device      TEXT        NOT NULL,
  clicks      INTEGER     NOT NULL DEFAULT 0,
  impressions INTEGER     NOT NULL DEFAULT 0,
  ctr         NUMERIC     NOT NULL DEFAULT 0,
  position    NUMERIC     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, search_type, query, page, country, device)
);

CREATE INDEX IF NOT EXISTS idx_gsc_query_date ON gsc_query_daily (date);
CREATE INDEX IF NOT EXISTS idx_gsc_query_query ON gsc_query_daily (query);
