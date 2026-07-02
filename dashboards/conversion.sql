-- Queries del dashboard "conversion". Endpoint: /api/q/conversion/<query>
-- Fuente: schema analytics de server_en_palabras (syncs de GA4), solo lectura.

-- @query funnel
-- Embudo de checkout semanal (begin_checkout → add_shipping → add_payment → purchase).
SELECT
  week_start_date,
  step_order,
  step_name,
  active_users,
  round(abandonment_rate::numeric, 4) AS abandonment_rate
FROM analytics.checkout_dropoff_funnel
WHERE week_start_date BETWEEN :from AND :to
ORDER BY week_start_date, step_order;

-- @query productos
-- Conversión por producto (view_item → add_to_cart → purchase). CVR = compras ÷ vistas × 100.
SELECT
  pp.producto,
  sum(u.view_item)::int   AS view_item,
  sum(u.add_to_cart)::int AS add_to_cart,
  sum(u.purchase)::int    AS purchase,
  CASE WHEN sum(u.view_item) > 0
       THEN round(sum(u.purchase)::numeric / sum(u.view_item) * 100, 2)
       ELSE 0 END          AS cvr
FROM analytics.users_cr_by_product u
JOIN public.productsparsed pp ON pp.variant = u.product_id
WHERE u.date BETWEEN :from AND :to
GROUP BY pp.producto
HAVING sum(u.view_item) > 0
ORDER BY purchase DESC
LIMIT 25;
