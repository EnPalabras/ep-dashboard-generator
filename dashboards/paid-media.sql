-- Queries del dashboard "paid-media". Endpoint: /api/q/paid-media/<query>
-- Compara Meta Ads (analytics.meta_account_daily / meta_campaign_insights) vs
-- TikTok Ads (analytics.tiktok_ads_daily). Todas toman :from y :to (comparación en el front).
-- Nota: TikTok Ads (report) no trae valor de compra → ROAS/revenue solo para Meta.

-- @query resumen
SELECT
  COALESCE((SELECT sum(amount_spent)        FROM analytics.meta_account_daily WHERE date BETWEEN :from AND :to), 0) AS meta_spend,
  COALESCE((SELECT sum(impressions)         FROM analytics.meta_account_daily WHERE date BETWEEN :from AND :to), 0) AS meta_impr,
  COALESCE((SELECT sum(link_click)          FROM analytics.meta_account_daily WHERE date BETWEEN :from AND :to), 0) AS meta_clicks,
  COALESCE((SELECT sum(omni_purchase)       FROM analytics.meta_account_daily WHERE date BETWEEN :from AND :to), 0) AS meta_conv,
  COALESCE((SELECT sum(omni_purchase_value) FROM analytics.meta_account_daily WHERE date BETWEEN :from AND :to), 0) AS meta_rev,
  COALESCE((SELECT sum(spend)       FROM analytics.tiktok_ads_daily WHERE date BETWEEN :from AND :to), 0) AS tk_spend,
  COALESCE((SELECT sum(impressions) FROM analytics.tiktok_ads_daily WHERE date BETWEEN :from AND :to), 0) AS tk_impr,
  COALESCE((SELECT sum(clicks)      FROM analytics.tiktok_ads_daily WHERE date BETWEEN :from AND :to), 0) AS tk_clicks,
  COALESCE((SELECT sum(conversion)  FROM analytics.tiktok_ads_daily WHERE date BETWEEN :from AND :to), 0) AS tk_conv;

-- @query diario
SELECT
  d.date,
  COALESCE(m.spend, 0) AS meta_spend,
  COALESCE(t.spend, 0) AS tk_spend
FROM (SELECT generate_series(:from::date, :to::date, '1 day')::date AS date) d
LEFT JOIN (SELECT date, sum(amount_spent) spend FROM analytics.meta_account_daily WHERE date BETWEEN :from AND :to GROUP BY date) m ON m.date = d.date
LEFT JOIN (SELECT date, sum(spend) spend FROM analytics.tiktok_ads_daily WHERE date BETWEEN :from AND :to GROUP BY date) t ON t.date = d.date
ORDER BY d.date;

-- @query meta-campanas
SELECT
  campaign_name,
  round(sum(spend)::numeric, 0)               AS spend,
  sum(omni_purchase)::int                      AS compras,
  CASE WHEN sum(spend) > 0
       THEN round(sum(omni_purchase_value)::numeric / sum(spend), 2) ELSE 0 END AS roas
FROM analytics.meta_campaign_insights
WHERE date BETWEEN :from AND :to
GROUP BY campaign_name
ORDER BY spend DESC
LIMIT 15;

-- @query tiktok-ads
SELECT
  ad_name,
  round(sum(spend)::numeric, 0) AS spend,
  sum(impressions)::int          AS impresiones,
  sum(clicks)::int               AS clicks,
  round(sum(conversion)::numeric, 0) AS conversiones
FROM analytics.tiktok_ads_daily
WHERE date BETWEEN :from AND :to
GROUP BY ad_name
ORDER BY spend DESC
LIMIT 15;
