-- Queries del dashboard "gasto-meta". Endpoint: /api/q/gasto-meta/<query>
-- Foco: cuánto se gastó en Meta Ads en los últimos 3 meses (y en qué se fue).
-- Gasto total/por día: analytics.meta_account_daily (nivel cuenta, reach/frequency ya
-- desduplicados por Meta). Desglose por campaña: meta_campaign_insights.
-- Desglose por plataforma: meta_platform_insights (usar spend, NO reach: Meta lo deduplica).

-- @query resumen
SELECT
  round(sum(amount_spent)::numeric, 0)                                AS spend,
  count(*)::int                                                       AS dias,
  round((sum(amount_spent) / NULLIF(count(*), 0))::numeric, 0)        AS spend_dia,
  sum(impressions)::bigint                                            AS impresiones,
  sum(link_click)::bigint                                             AS clicks,
  CASE WHEN sum(impressions) > 0
       THEN round((sum(amount_spent) * 1000 / sum(impressions))::numeric, 0) ELSE 0 END AS cpm,
  CASE WHEN sum(link_click) > 0
       THEN round((sum(amount_spent) / sum(link_click))::numeric, 0)   ELSE 0 END AS cpc,
  sum(omni_purchase)::int                                             AS compras,
  CASE WHEN sum(amount_spent) > 0
       THEN round((sum(omni_purchase_value) / sum(amount_spent))::numeric, 2) ELSE 0 END AS roas
FROM analytics.meta_account_daily
WHERE date BETWEEN :from AND :to;

-- @query diario
SELECT
  d.date                              AS fecha,
  round(COALESCE(m.spend, 0)::numeric, 0) AS spend
FROM (SELECT generate_series(:from::date, :to::date, '1 day')::date AS date) d
LEFT JOIN (
  SELECT date, sum(amount_spent) AS spend
  FROM analytics.meta_account_daily
  WHERE date BETWEEN :from AND :to
  GROUP BY date
) m ON m.date = d.date
ORDER BY d.date;

-- @query por-mes
SELECT
  date_trunc('month', date)::date       AS mes,
  round(sum(amount_spent)::numeric, 0)  AS spend,
  count(*)::int                         AS dias,
  sum(omni_purchase)::int               AS compras,
  CASE WHEN sum(amount_spent) > 0
       THEN round((sum(omni_purchase_value) / sum(amount_spent))::numeric, 2) ELSE 0 END AS roas
FROM analytics.meta_account_daily
WHERE date BETWEEN :from AND :to
GROUP BY 1
ORDER BY 1;

-- @query por-campana
SELECT
  campaign_name,
  round(sum(spend)::numeric, 0)  AS spend,
  sum(impressions)::bigint       AS impresiones,
  sum(link_click)::bigint        AS clicks,
  sum(omni_purchase)::int        AS compras,
  CASE WHEN sum(spend) > 0
       THEN round((sum(omni_purchase_value) / sum(spend))::numeric, 2) ELSE 0 END AS roas
FROM analytics.meta_campaign_insights
WHERE date BETWEEN :from AND :to
GROUP BY campaign_name
ORDER BY spend DESC
LIMIT 20;

-- @query por-plataforma
SELECT
  publisher_platform            AS plataforma,
  round(sum(spend)::numeric, 0) AS spend,
  sum(impressions)::bigint      AS impresiones,
  sum(omni_purchase)::int       AS compras
FROM analytics.meta_platform_insights
WHERE date BETWEEN :from AND :to
GROUP BY publisher_platform
ORDER BY spend DESC;
