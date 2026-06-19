-- Ratios (ctr/cpm/roas) recalculadas desde bases sumables, no promediadas.
-- Uso: /api/q/meta-ads?from=2026-06-01&to=2026-06-19
SELECT
  e.ad_id,
  e.ad_name,
  e.campaign_id,
  e.campaign_name,
  e.effective_status,
  COALESCE(SUM(i.spend), 0)               AS amount_spent,
  COALESCE(SUM(i.impressions), 0)         AS impressions,
  CASE WHEN SUM(i.impressions) > 0
       THEN ROUND(SUM(i.clicks)::numeric / SUM(i.impressions) * 100, 4) ELSE 0 END AS ctr,
  CASE WHEN SUM(i.impressions) > 0
       THEN ROUND(SUM(i.spend)::numeric / SUM(i.impressions) * 1000, 2) ELSE 0 END AS cpm,
  COALESCE(SUM(i.omni_purchase), 0)       AS omni_purchase,
  COALESCE(SUM(i.omni_purchase_value), 0) AS omni_purchase_value,
  CASE WHEN SUM(i.spend) > 0
       THEN ROUND(SUM(i.omni_purchase_value)::numeric / SUM(i.spend), 4) ELSE 0 END AS purchase_roas,
  ROUND(AVG(NULLIF(i.frequency, 0)), 4)   AS avg_frequency
FROM meta_ad_entities e
LEFT JOIN meta_campaign_insights i
  ON i.ad_id = e.ad_id AND i.date BETWEEN :from AND :to
GROUP BY e.ad_id, e.ad_name, e.campaign_id, e.campaign_name, e.effective_status
ORDER BY amount_spent DESC;
