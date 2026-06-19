-- Uso: /api/q/meta-total?window=last_28d   (windows: last_7d | last_28d | mtd)
SELECT
  window_label,
  period_from,
  period_to,
  amount_spent,
  reach,
  impressions,
  frequency,
  ctr,
  cpm,
  purchase_roas,
  omni_purchase,
  omni_purchase_value
FROM meta_account_totals
WHERE window_label = :window
ORDER BY computed_at DESC
LIMIT 1;
