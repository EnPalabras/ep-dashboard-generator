-- Ventas reales por canal para un rango (venta = orden no cancelada con pago paid/approved).
SELECT
  channel,
  count(*)::int                        AS ordenes,
  round(sum(total_amount)::numeric, 0) AS revenue,
  round(avg(total_amount)::numeric, 0) AS aov
FROM public."Orders" o
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (
    SELECT 1 FROM public."OrdersPayments" p
    WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved')
  )
GROUP BY channel
ORDER BY revenue DESC;
