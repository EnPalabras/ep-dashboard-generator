-- Medios de pago de las ventas reales para un rango.
-- Suma los pagos paid/approved de órdenes no canceladas (una orden con pago dividido
-- puede aparecer en más de un método).
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
