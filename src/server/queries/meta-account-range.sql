-- Totales de cuenta sumados sobre un rango ARBITRARIO de fechas.
-- OJO: NO incluye reach/frequency — Meta los entrega deduplicados solo por ventana
-- (last_7d/last_28d/mtd), no se pueden sumar día a día para un rango a medida.
-- Uso: /api/q/meta-account-range?from=2026-06-01&to=2026-06-26
SELECT
  COALESCE(SUM(amount_spent), 0)        AS amount_spent,
  COALESCE(SUM(impressions), 0)         AS impressions,
  COALESCE(SUM(omni_purchase), 0)       AS omni_purchase,
  COALESCE(SUM(omni_purchase_value), 0) AS omni_purchase_value,
  COALESCE(SUM(landing_page_view), 0)   AS landing_page_view,
  COALESCE(SUM(add_to_cart), 0)         AS add_to_cart,
  COALESCE(SUM(link_click), 0)          AS link_click,
  CASE WHEN SUM(impressions) > 0
       THEN ROUND(SUM(amount_spent)::numeric / SUM(impressions) * 1000, 2) ELSE 0 END AS cpm,
  -- CTR ponderado por impresiones (el ctr está guardado por día)
  CASE WHEN SUM(impressions) > 0
       THEN ROUND(SUM(ctr * impressions)::numeric / SUM(impressions), 4) ELSE 0 END AS ctr,
  CASE WHEN SUM(amount_spent) > 0
       THEN ROUND(SUM(omni_purchase_value)::numeric / SUM(amount_spent), 4) ELSE 0 END AS purchase_roas,
  CASE WHEN SUM(omni_purchase) > 0
       THEN ROUND(SUM(amount_spent)::numeric / SUM(omni_purchase), 2) ELSE 0 END AS cac,
  -- CVR proxy de Meta = compras / visitas a la web (landing_page_view), en %
  CASE WHEN SUM(landing_page_view) > 0
       THEN ROUND(SUM(omni_purchase)::numeric / SUM(landing_page_view) * 100, 2) ELSE 0 END AS cvr
FROM meta_account_daily
WHERE date BETWEEN :from AND :to;
