-- Queries del dashboard "ventas-reales". Endpoint: /api/q/ventas-reales/<query>
-- Venta = orden NO cancelada con al menos un pago paid/approved (cross-canal; Orders.status
-- es gestión, no pago: TiendaNube 'open', ML 'paid', Coshowroom 'closed'). Revenue = total_amount.
-- Fuente: DB de server_en_palabras (schema public), solo lectura.

-- @query resumen
SELECT
  count(*)::int                        AS ordenes,
  round(sum(total_amount)::numeric, 0) AS revenue,
  round(avg(total_amount)::numeric, 0) AS aov,
  count(DISTINCT mail)::int            AS clientes
FROM public."Orders" o
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
              WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'));

-- @query por-canal
SELECT
  channel,
  count(*)::int                        AS ordenes,
  round(sum(total_amount)::numeric, 0) AS revenue,
  round(avg(total_amount)::numeric, 0) AS aov
FROM public."Orders" o
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
              WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
GROUP BY channel
ORDER BY revenue DESC;

-- @query diario
SELECT
  date_created::date                   AS fecha,
  count(*)::int                        AS ordenes,
  round(sum(total_amount)::numeric, 0) AS revenue
FROM public."Orders" o
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
              WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
GROUP BY date_created::date
ORDER BY fecha;

-- @query por-pago
SELECT
  p.payment_method,
  count(DISTINCT o."idEP")::int                     AS ordenes,
  round(sum(p.payment_received_amount)::numeric, 0) AS monto
FROM public."Orders" o
JOIN public."OrdersPayments" p ON p."idEP" = o."idEP"
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND p.payment_status IN ('paid', 'approved')
GROUP BY p.payment_method
ORDER BY monto DESC NULLS LAST;

-- @query top-productos
SELECT
  oi.product,
  sum(oi.quantity)::int                           AS unidades,
  round(sum(oi.total_product_amount)::numeric, 0) AS revenue
FROM public."OrdersItems" oi
JOIN public."Orders" o ON o."idEP" = oi."idEP"
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
              WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
GROUP BY oi.product
ORDER BY revenue DESC
LIMIT 20;
