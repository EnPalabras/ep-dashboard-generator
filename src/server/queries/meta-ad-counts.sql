-- Conteos de anuncios para los KPIs de inventario.
-- new_7d / stopped_7d son relativos a HOY (no al rango elegido).
-- stopped_7d es un PROXY honesto: ads hoy pausados que gastaban la semana previa
-- y dejaron de gastar en los últimos 7 días (no guardamos la fecha exacta de pausa).
WITH first_seen AS (
  SELECT ad_id, MIN(date) AS first_date
  FROM meta_campaign_insights GROUP BY ad_id
),
recent AS (
  SELECT ad_id, SUM(spend) AS spend_7d
  FROM meta_campaign_insights
  WHERE date > (now()::date - 7) GROUP BY ad_id
),
prev AS (
  SELECT ad_id, SUM(spend) AS spend_prev
  FROM meta_campaign_insights
  WHERE date BETWEEN (now()::date - 13) AND (now()::date - 7) GROUP BY ad_id
)
SELECT
  (SELECT COUNT(*) FROM meta_ad_entities)                                        AS total_ads,
  (SELECT COUNT(*) FROM meta_ad_entities WHERE effective_status = 'ACTIVE')      AS active_ads,
  (SELECT COUNT(*) FROM meta_ad_entities WHERE effective_status LIKE '%PAUSED%') AS paused_ads,
  (SELECT COUNT(*) FROM first_seen WHERE first_date > (now()::date - 7))         AS new_7d,
  -- Pausados últimos 7d (REAL): ad hoy pausado cuya última modificación en Meta fue en los últimos 7 días.
  (SELECT COUNT(*) FROM meta_ad_entities
     WHERE effective_status LIKE '%PAUSED%'
       AND meta_updated_time >= (now() - interval '7 days'))                     AS paused_7d,
  -- Respaldo (estimado por gasto) por si todavía no se pobló meta_updated_time.
  (SELECT COUNT(*)
     FROM meta_ad_entities e
     JOIN prev p ON p.ad_id = e.ad_id
     LEFT JOIN recent r ON r.ad_id = e.ad_id
     WHERE e.effective_status LIKE '%PAUSED%'
       AND p.spend_prev > 0
       AND COALESCE(r.spend_7d, 0) = 0)                                          AS stopped_7d;
