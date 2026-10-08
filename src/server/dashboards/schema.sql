-- Dashboards guardados en la base (v2): el contenido vive acá, no en el repo, así publicar no
-- requiere commit ni deploy. `version` sube con cada publicación; cada una queda en dashboard_versions.
ALTER TABLE analytics.dashboards
  ADD COLUMN IF NOT EXISTS html       TEXT,
  ADD COLUMN IF NOT EXISTS sql        TEXT,
  ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE analytics.dashboards ALTER COLUMN file DROP NOT NULL;

CREATE TABLE IF NOT EXISTS analytics.dashboard_versions (
  slug        TEXT        NOT NULL REFERENCES analytics.dashboards (slug) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  html        TEXT        NOT NULL,
  sql         TEXT        NOT NULL,
  author      TEXT        NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (slug, version)
);
