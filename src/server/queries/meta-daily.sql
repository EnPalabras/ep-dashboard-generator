-- Uso: /api/q/meta-daily?from=2026-06-01&to=2026-06-19
SELECT
  date,
  amount_spent,
  impressions,
  reach,
  frequency,
  ctr,
  cpm,
  purchase_roas,
  omni_purchase,
  omni_purchase_value,
  landing_page_view
FROM meta_account_daily
WHERE date BETWEEN :from AND :to
ORDER BY date;
