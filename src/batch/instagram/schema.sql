-- IG a nivel post (media): una fila por reel/carrusel/imagen. Tabla nuestra.
CREATE TABLE IF NOT EXISTS instagram_posts (
  media_id           TEXT        PRIMARY KEY,
  timestamp          TIMESTAMPTZ,
  date               DATE,
  media_type         TEXT,
  caption            TEXT,
  permalink          TEXT,
  reach              INTEGER     NOT NULL DEFAULT 0,
  views              INTEGER     NOT NULL DEFAULT 0,
  likes              INTEGER     NOT NULL DEFAULT 0,
  comments           INTEGER     NOT NULL DEFAULT 0,
  saved              INTEGER     NOT NULL DEFAULT 0,
  shares             INTEGER     NOT NULL DEFAULT 0,
  total_interactions INTEGER     NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_date ON instagram_posts (date);
