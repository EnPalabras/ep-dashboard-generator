-- Queries del dashboard "negocio-360". Endpoint: /api/q/negocio-360/<query>
-- Panorama ejecutivo cruzando ventas reales (public) + gastos (public) + tráfico (analytics.ga4).
-- Venta = orden no cancelada con pago paid/approved. Todas las queries toman :from y :to,
-- así el front las corre 2 veces (período actual vs comparación) para MoM / período anterior / YoY.

-- @query resumen
WITH ventas AS (
  SELECT o.total_amount, o.mail
  FROM public."Orders" o
  WHERE o.status <> 'cancelled'
    AND o.date_created::date BETWEEN :from AND :to
    AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
                WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
)
SELECT
  (SELECT count(*) FROM ventas)::int                                              AS ordenes,
  COALESCE((SELECT sum(total_amount) FROM ventas), 0)                             AS revenue,
  COALESCE((SELECT round(avg(total_amount)) FROM ventas), 0)                      AS aov,
  (SELECT count(DISTINCT mail) FROM ventas)::int                                  AS clientes,
  COALESCE((SELECT sum(monto) FROM public.gastos WHERE fecha_pago BETWEEN :from AND :to), 0)                       AS gastos,
  COALESCE((SELECT sum(monto) FROM public.gastos WHERE categoria = 'ADS' AND fecha_pago BETWEEN :from AND :to), 0) AS ads,
  COALESCE((SELECT sum(sessions) FROM analytics.ga4_traffic_daily WHERE date BETWEEN :from AND :to), 0)::int       AS sesiones;

-- @query diario
SELECT
  o.date_created::date                   AS fecha,
  round(sum(o.total_amount)::numeric, 0) AS revenue
FROM public."Orders" o
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
              WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
GROUP BY o.date_created::date
ORDER BY fecha;

-- @query por-canal
SELECT
  o.channel,
  round(sum(o.total_amount)::numeric, 0) AS revenue
FROM public."Orders" o
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
              WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
GROUP BY o.channel
ORDER BY revenue DESC;

-- @query gastos-categoria
SELECT
  COALESCE(categoria, '(sin categoría)') AS categoria,
  round(sum(monto)::numeric, 0)          AS total
FROM public.gastos
WHERE fecha_pago BETWEEN :from AND :to
GROUP BY categoria
ORDER BY total DESC;
