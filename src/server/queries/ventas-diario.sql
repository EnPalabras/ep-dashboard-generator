-- @db analytics
-- Serie diaria de ventas reales para un rango (venta = orden no cancelada con pago paid/approved).
SELECT
  date_created::date                   AS fecha,
  count(*)::int                        AS ordenes,
  round(sum(total_amount)::numeric, 0) AS revenue
FROM public."Orders" o
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (
    SELECT 1 FROM public."OrdersPayments" p
    WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved')
  )
GROUP BY date_created::date
ORDER BY fecha;
