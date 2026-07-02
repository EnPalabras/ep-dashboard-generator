-- @db analytics
-- Totales de ventas reales para un rango.
-- Venta = orden NO cancelada con al menos un pago paid/approved (cross-canal; el status
-- de la orden es gestión, no pago: TiendaNube usa 'open', ML 'paid', coshowroom 'closed').
-- Fuente: public.Orders + public.OrdersPayments (DB de server_en_palabras).
SELECT
  count(*)::int                        AS ordenes,
  round(sum(total_amount)::numeric, 0) AS revenue,
  round(avg(total_amount)::numeric, 0) AS aov,
  count(DISTINCT mail)::int            AS clientes
FROM public."Orders" o
WHERE o.status <> 'cancelled'
  AND o.date_created::date BETWEEN :from AND :to
  AND EXISTS (
    SELECT 1 FROM public."OrdersPayments" p
    WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved')
  );
