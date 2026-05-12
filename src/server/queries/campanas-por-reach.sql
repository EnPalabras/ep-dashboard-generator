SELECT
  campaign_id,
  campaign_name,
  SUM(reach)::bigint        AS total_reach,
  SUM(impressions)::bigint  AS total_impressions,
  SUM(spend)::numeric(12,2) AS total_spend,
  SUM(clicks)::bigint       AS total_clicks,
  MIN(date)                 AS first_date,
  MAX(date)                 AS last_date
FROM meta_campaign_insights
WHERE date BETWEEN :from AND :to
GROUP BY campaign_id, campaign_name
HAVING SUM(reach) > 0
ORDER BY total_reach DESC;
