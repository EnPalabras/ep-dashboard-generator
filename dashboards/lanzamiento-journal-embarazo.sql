-- Queries del dashboard "lanzamiento-journal-embarazo". Endpoint: /api/q/lanzamiento-journal-embarazo/<query>
-- Lanzamiento (preventa) del Journal de Embarazo en Tienda Nube. Sin parámetros: el rango
-- arranca solo el día de la primera venta del producto y llega hasta hoy.
-- Producto: OrdersItems.product ILIKE '%journal de embarazo%' (hoy "PREVENTA Journal de Embarazo",
-- SKU 00EPJOUANEM01UD). En GA4 (users_cr_by_product) es el product_id 1610663851.
-- Venta = orden NO cancelada con al menos un pago paid/approved (ver ventas-reales.sql).

-- @query resumen
WITH ventas AS (
  SELECT o."idEP", o.mail, o.date_created, o.total_amount, oi.quantity, oi.total_product_amount
  FROM public."OrdersItems" oi
  JOIN public."Orders" o ON o."idEP" = oi."idEP"
  WHERE oi.product ILIKE '%journal de embarazo%'
    AND o.channel = 'tiendanube'
    AND o.status <> 'cancelled'
    AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
                WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
),
pendientes AS (
  SELECT count(DISTINCT o."idEP")::int AS n
  FROM public."OrdersItems" oi
  JOIN public."Orders" o ON o."idEP" = oi."idEP"
  WHERE oi.product ILIKE '%journal de embarazo%'
    AND o.channel = 'tiendanube'
    AND o.status <> 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM public."OrdersPayments" p
                    WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
)
SELECT
  min(v.date_created)::date                                   AS lanzamiento,
  (current_date - min(v.date_created)::date + 1)::int         AS dias,
  sum(v.quantity)::int                                        AS unidades,
  count(DISTINCT v."idEP")::int                               AS ordenes,
  round(sum(v.total_product_amount)::numeric, 0)              AS revenue_producto,
  round(sum(v.total_amount)::numeric, 0)                      AS revenue_ordenes,
  round((sum(v.total_amount) / nullif(count(DISTINCT v."idEP"), 0))::numeric, 0) AS ticket_orden,
  count(DISTINCT v."idEP") FILTER (
    WHERE (SELECT count(*) FROM public."OrdersItems" x WHERE x."idEP" = v."idEP") > 1)::int AS ordenes_con_otros,
  count(DISTINCT v.mail)::int                                 AS clientes,
  count(DISTINCT v.mail) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM public."Orders" o2
    WHERE o2.mail = v.mail AND o2.date_created < v.date_created AND o2.status <> 'cancelled'
      AND EXISTS (SELECT 1 FROM public."OrdersPayments" p2
                  WHERE p2."idEP" = o2."idEP" AND p2.payment_status IN ('paid', 'approved'))))::int AS clientes_nuevos,
  (SELECT n FROM pendientes)                                  AS ordenes_pendientes
FROM ventas v;

-- @query diario
WITH ventas AS (
  SELECT o.date_created::date AS fecha, oi.quantity, oi.total_product_amount
  FROM public."OrdersItems" oi
  JOIN public."Orders" o ON o."idEP" = oi."idEP"
  WHERE oi.product ILIKE '%journal de embarazo%'
    AND o.channel = 'tiendanube'
    AND o.status <> 'cancelled'
    AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
                WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
),
dias AS (
  SELECT generate_series((SELECT min(fecha) FROM ventas), current_date, interval '1 day')::date AS fecha
)
SELECT
  d.fecha,
  coalesce(sum(v.quantity), 0)::int                              AS unidades,
  round(coalesce(sum(v.total_product_amount), 0)::numeric, 0)    AS revenue
FROM dias d
LEFT JOIN ventas v ON v.fecha = d.fecha
GROUP BY d.fecha
ORDER BY d.fecha;

-- @query comparativo
-- Unidades por día desde el lanzamiento (día 1 = primera venta) de cada journal lanzado en 2026,
-- primeros 30 días. Se agrupan las variantes con/sin anillado y se ignora el prefijo PREVENTA.
WITH items AS (
  SELECT
    regexp_replace(regexp_replace(oi.product, '^PREVENTA\s+', '', 'i'), '\s*\((Con|Sin) Anillado\)\s*$', '', 'i') AS journal,
    o.date_created::date AS fecha,
    oi.quantity
  FROM public."OrdersItems" oi
  JOIN public."Orders" o ON o."idEP" = oi."idEP"
  WHERE o.channel = 'tiendanube'
    AND o.status <> 'cancelled'
    -- Se mira desde dic-25 para que los journals que ya se vendían (el original) no parezcan lanzados el 1/1.
    AND o.date_created >= '2025-12-01'
    AND regexp_replace(oi.product, '^PREVENTA\s+', '', 'i') ILIKE 'journal%'
    AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
                WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved'))
),
lanz AS (
  SELECT journal, min(fecha) AS lanzamiento FROM items GROUP BY journal
)
SELECT
  i.journal,
  l.lanzamiento,
  (i.fecha - l.lanzamiento + 1)::int AS dia,
  sum(i.quantity)::int               AS unidades
FROM items i
JOIN lanz l ON l.journal = i.journal
WHERE l.lanzamiento >= '2026-01-01'
  AND i.fecha - l.lanzamiento < 30
GROUP BY i.journal, l.lanzamiento, i.fecha
ORDER BY l.lanzamiento, dia;

-- @query funnel
-- Embudo del producto según GA4 (vista de producto → agregado al carrito → compra), por día.
SELECT
  date                       AS fecha,
  sum(view_item)::int        AS vistas,
  sum(add_to_cart)::int      AS carrito,
  sum(purchase)::int         AS compras
FROM analytics.users_cr_by_product
WHERE product_id = '1610663851'
GROUP BY date
ORDER BY date;

-- @query por-pago
SELECT
  p.payment_method,
  count(DISTINCT o."idEP")::int AS ordenes
FROM public."OrdersItems" oi
JOIN public."Orders" o ON o."idEP" = oi."idEP"
JOIN public."OrdersPayments" p ON p."idEP" = o."idEP"
WHERE oi.product ILIKE '%journal de embarazo%'
  AND o.channel = 'tiendanube'
  AND o.status <> 'cancelled'
  AND p.payment_status IN ('paid', 'approved')
GROUP BY p.payment_method
ORDER BY ordenes DESC;

-- @query junto-con
-- Otros productos que vinieron en las mismas órdenes que el journal.
SELECT
  x.product,
  count(DISTINCT x."idEP")::int                    AS ordenes,
  sum(x.quantity)::int                             AS unidades,
  round(sum(x.total_product_amount)::numeric, 0)   AS revenue
FROM public."OrdersItems" x
WHERE x.product NOT ILIKE '%journal de embarazo%'
  AND x."idEP" IN (
    SELECT o."idEP"
    FROM public."OrdersItems" oi
    JOIN public."Orders" o ON o."idEP" = oi."idEP"
    WHERE oi.product ILIKE '%journal de embarazo%'
      AND o.channel = 'tiendanube'
      AND o.status <> 'cancelled'
      AND EXISTS (SELECT 1 FROM public."OrdersPayments" p
                  WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved')))
GROUP BY x.product
ORDER BY ordenes DESC, revenue DESC;

-- @query ordenes
-- Detalle de órdenes con el journal (incluye las que todavía no tienen el pago acreditado).
SELECT
  o."idEP"                                         AS orden,
  o.date_created                                   AS fecha,
  round(o.total_amount::numeric, 0)                AS total,
  (SELECT count(*) FROM public."OrdersItems" x WHERE x."idEP" = o."idEP")::int AS items,
  (SELECT string_agg(DISTINCT p.payment_method, ', ') FROM public."OrdersPayments" p WHERE p."idEP" = o."idEP") AS medio_pago,
  EXISTS (SELECT 1 FROM public."OrdersPayments" p
          WHERE p."idEP" = o."idEP" AND p.payment_status IN ('paid', 'approved')) AS pagada
FROM public."OrdersItems" oi
JOIN public."Orders" o ON o."idEP" = oi."idEP"
WHERE oi.product ILIKE '%journal de embarazo%'
  AND o.channel = 'tiendanube'
  AND o.status <> 'cancelled'
ORDER BY o.date_created DESC;
