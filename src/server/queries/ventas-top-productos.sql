-- Top productos por revenue en ventas reales para un rango
-- (venta = orden no cancelada con pago paid/approved).
SELECT
  oi.product,
  sum(oi.quantity)::int                           AS unidades,
  round(sum(oi.total_product_amount)::numeric, 0) AS revenue
FROM public."OrdersItems" oi
JOIN public."Orders" o ON o."idEP" = oi."idEP"
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (
    SELECT 1 FROM public."OrdersPayments" p
    WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved')
  )
GROUP BY oi.product
ORDER BY revenue DESC
LIMIT 20;
