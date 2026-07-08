-- Queries del dashboard "instagram". Endpoint: /api/q/instagram/<query>
-- Fuente: analytics.instagram_by_day (sync diario de Instagram orgánico). Solo lectura.

-- @query resumen
SELECT
  (SELECT all_followers FROM analytics.instagram_by_day WHERE all_followers IS NOT NULL ORDER BY date DESC LIMIT 1) AS seguidores,
  COALESCE(sum(follower_count), 0)::int  AS nuevos_seguidores,
  COALESCE(sum(impressions), 0)::int     AS impresiones,
  COALESCE(round(avg(reach)), 0)::int    AS alcance_prom_dia,
  COALESCE(sum(total_interactions), 0)::int AS interacciones,
  CASE WHEN sum(reach) > 0
       THEN round(sum(total_interactions)::numeric / sum(reach) * 100, 2)
       ELSE 0 END                        AS er_pct
FROM analytics.instagram_by_day
WHERE date BETWEEN :from AND :to;

-- @query diario
SELECT
  date,
  reach,
  total_interactions,
  follower_count
FROM analytics.instagram_by_day
WHERE date BETWEEN :from AND :to
ORDER BY date;

-- @query engagement
SELECT
  COALESCE(sum(likes), 0)::int    AS likes,
  COALESCE(sum(saves), 0)::int    AS saves,
  COALESCE(sum(shares), 0)::int   AS shares,
  COALESCE(sum(comments), 0)::int AS comments
FROM analytics.instagram_by_day
WHERE date BETWEEN :from AND :to;
