-- Engagement + mensajería por día (nivel cuenta).
-- Uso: /api/q/meta-engagement?from=2026-06-01&to=2026-06-21
SELECT
  date,
  post_save,
  comment,
  shares,
  link_click,
  post_reaction,
  messaging_first_reply,
  messaging_started,
  view_content,
  add_to_cart,
  initiate_checkout,
  omni_purchase
FROM meta_account_daily
WHERE date BETWEEN :from AND :to
ORDER BY date;
