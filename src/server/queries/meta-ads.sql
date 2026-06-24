-- Tabla de anuncios con métricas del período. Ratios recalculados desde bases sumables.
-- Uso: /api/q/meta-ads?from=2026-06-01&to=2026-06-19
-- OJO frecuencia: AVG(frequency) es APROXIMADA — el reach no se deduplica entre días.
SELECT
  e.ad_id,
  e.ad_name,
  e.campaign_id,
  e.campaign_name,
  e.effective_status,
  COALESCE(SUM(i.spend), 0)               AS amount_spent,
  COALESCE(SUM(i.impressions), 0)         AS impressions,
  COALESCE(SUM(i.clicks), 0)              AS clicks,
  CASE WHEN SUM(i.impressions) > 0
       THEN ROUND(SUM(i.clicks)::numeric / SUM(i.impressions) * 100, 4) ELSE 0 END AS ctr,
  CASE WHEN SUM(i.impressions) > 0
       THEN ROUND(SUM(i.spend)::numeric / SUM(i.impressions) * 1000, 2) ELSE 0 END AS cpm,
  CASE WHEN SUM(i.clicks) > 0
       THEN ROUND(SUM(i.spend)::numeric / SUM(i.clicks), 2) ELSE 0 END AS cpc,
  COALESCE(SUM(i.omni_purchase), 0)       AS omni_purchase,
  COALESCE(SUM(i.omni_purchase_value), 0) AS omni_purchase_value,
  CASE WHEN SUM(i.spend) > 0
       THEN ROUND(SUM(i.omni_purchase_value)::numeric / SUM(i.spend), 4) ELSE 0 END AS purchase_roas,
  -- CAC = gasto / compras
  CASE WHEN SUM(i.omni_purchase) > 0
       THEN ROUND(SUM(i.spend)::numeric / SUM(i.omni_purchase), 2) ELSE 0 END AS cac,
  -- Funnel
  COALESCE(SUM(i.add_to_cart), 0)         AS add_to_cart,
  COALESCE(SUM(i.initiate_checkout), 0)   AS initiate_checkout,
  -- ATC -> compra (%)
  CASE WHEN SUM(i.add_to_cart) > 0
       THEN ROUND(SUM(i.omni_purchase)::numeric / SUM(i.add_to_cart) * 100, 1) ELSE 0 END AS atc_to_purchase_pct,
  -- Engagement
  COALESCE(SUM(i.post_save), 0)           AS post_save,
  COALESCE(SUM(i.comment), 0)             AS comment,
  COALESCE(SUM(i.shares), 0)              AS shares,
  COALESCE(SUM(i.link_click), 0)          AS link_click,
  COALESCE(SUM(i.post_reaction), 0)       AS post_reaction,
  -- Mensajería
  COALESCE(SUM(i.messaging_first_reply), 0) AS messaging_first_reply,
  COALESCE(SUM(i.messaging_started), 0)     AS messaging_started,
  ROUND(AVG(NULLIF(i.frequency, 0)), 4)   AS avg_frequency
FROM meta_ad_entities e
LEFT JOIN meta_campaign_insights i
  ON i.ad_id = e.ad_id AND i.date BETWEEN :from AND :to
GROUP BY e.ad_id, e.ad_name, e.campaign_id, e.campaign_name, e.effective_status
ORDER BY amount_spent DESC;
