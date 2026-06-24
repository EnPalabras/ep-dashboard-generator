-- Performance por plataforma y posición (IG vs FB, feed/stories/reels).
-- Uso: /api/q/meta-por-plataforma?from=2026-06-01&to=2026-06-21
-- OJO: el reach NO se suma entre filas (Meta lo deduplica por plataforma); se muestra como referencia.
SELECT
  publisher_platform,
  platform_position,
  SUM(spend)::numeric(14,2)          AS spend,
  SUM(impressions)::bigint           AS impressions,
  SUM(clicks)::bigint                AS clicks,
  CASE WHEN SUM(impressions) > 0
       THEN ROUND(SUM(clicks)::numeric / SUM(impressions) * 100, 4) ELSE 0 END AS ctr,
  CASE WHEN SUM(impressions) > 0
       THEN ROUND(SUM(spend)::numeric / SUM(impressions) * 1000, 2) ELSE 0 END AS cpm,
  SUM(omni_purchase)::bigint         AS omni_purchase,
  SUM(omni_purchase_value)::numeric(14,2) AS omni_purchase_value,
  CASE WHEN SUM(spend) > 0
       THEN ROUND(SUM(omni_purchase_value)::numeric / SUM(spend), 4) ELSE 0 END AS purchase_roas,
  SUM(add_to_cart)::bigint           AS add_to_cart
FROM meta_platform_insights
WHERE date BETWEEN :from AND :to
GROUP BY publisher_platform, platform_position
ORDER BY spend DESC;
