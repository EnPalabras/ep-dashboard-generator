-- @db v2
-- Queries del dashboard "trafico-landing". Endpoint: /api/q/trafico-landing/<query>
-- Lee de la base de v2: los pedidos de Tienda Nube salen de public.orders (el legacy pierde
-- órdenes) y las tablas de analytics están en las dos bases por el dual-write del batch.
-- "Meta pago" y "TikTok pago" juntan las etiquetas UTM de anuncios, que cambiaron en sep-2025.

-- @query landing
-- Un solo objeto con la forma que usa el HTML: semanas (arrancan el domingo), landings ordenadas
-- por sesiones, canales, fuentes y filas [landing, semana, canal, fuente, sesiones,
-- sesiones con interacción, transacciones, ingresos]. Landings con < 150 sesiones van a
-- "(otras páginas)" y fuentes con < 150 sesiones a "(otras fuentes)".
WITH base AS (
  SELECT
    greatest(date - extract(dow FROM date)::int, date '2025-01-01') AS week,
    landing_page, channel, source, medium,
    sessions, engaged_sessions, transactions, purchase_revenue,
    CASE
      WHEN source ~* '^tiktok' AND medium ~* '^(paid|paid_social|cpc)$' THEN 'tiktok'
      WHEN (source ~* '^(facebook|fb|ig|instagram)' AND medium ~* '^(paid|paid_social|cpc)$')
        OR (source IN ('fb', 'ig') AND medium ~* '^(instagram|facebook)_') THEN 'meta'
    END AS paid
  FROM analytics.ga4_landing_daily
  WHERE date >= '2025-01-01'
),
labeled AS (
  SELECT
    week, landing_page,
    CASE paid WHEN 'meta' THEN 'Meta pago' WHEN 'tiktok' THEN 'TikTok pago' ELSE channel END AS ch,
    CASE paid
      WHEN 'meta' THEN 'Meta pago (fb / ig, todas las variantes)'
      WHEN 'tiktok' THEN 'TikTok pago (todas las variantes)'
      ELSE source || ' / ' || medium
    END AS src,
    sessions, engaged_sessions, transactions, purchase_revenue
  FROM base
),
lp AS (
  SELECT landing_page, sum(sessions) AS s FROM labeled GROUP BY 1
),
sm AS (
  SELECT src, sum(sessions) AS s FROM labeled GROUP BY 1
),
grouped AS (
  SELECT
    l.week,
    CASE WHEN lp.s < 150 THEN '(otras páginas)' ELSE l.landing_page END AS landing_page,
    l.ch,
    CASE WHEN sm.s < 150 THEN '(otras fuentes)' ELSE l.src END AS src,
    sum(l.sessions) AS sessions, sum(l.engaged_sessions) AS engaged,
    sum(l.transactions) AS transactions, sum(l.purchase_revenue) AS revenue
  FROM labeled l
  JOIN lp USING (landing_page)
  JOIN sm USING (src)
  GROUP BY 1, 2, 3, 4
),
weeks AS (
  SELECT week, row_number() OVER (ORDER BY week) - 1 AS i FROM (SELECT DISTINCT week FROM grouped) w
),
landings AS (
  SELECT landing_page, row_number() OVER (ORDER BY sum(sessions) DESC, landing_page) - 1 AS i
  FROM grouped GROUP BY 1
),
channels AS (
  SELECT ch, row_number() OVER (ORDER BY sum(sessions) DESC, ch) - 1 AS i FROM grouped GROUP BY 1
),
sources AS (
  SELECT src, row_number() OVER (ORDER BY sum(sessions) DESC, src) - 1 AS i FROM grouped GROUP BY 1
)
SELECT json_build_object(
  'weeks', (SELECT json_agg(to_char(week, 'YYYY-MM-DD') ORDER BY i) FROM weeks),
  'landings', (SELECT json_agg(landing_page ORDER BY i) FROM landings),
  'channels', (SELECT json_agg(ch ORDER BY i) FROM channels),
  'sources', (SELECT json_agg(src ORDER BY i) FROM sources),
  'rows', (
    SELECT json_agg(json_build_array(
      l.i, w.i, c.i, s.i, g.sessions, g.engaged, g.transactions, round(g.revenue)
    ))
    FROM grouped g
    JOIN weeks w USING (week)
    JOIN landings l USING (landing_page)
    JOIN channels c USING (ch)
    JOIN sources s USING (src)
  ),
  'hasta', (SELECT to_char(max(date), 'YYYY-MM-DD') FROM analytics.ga4_landing_daily)
) AS d;

-- @query plataformas
-- Por plataforma y mes calendario: inversión y clics de la plataforma, ventas y valor que se
-- atribuye Meta (pconv/pval; Google y TikTok en 0: google_ads_daily sale de GA4, no de su API) y
-- sesiones, transacciones e ingresos que le da GA4.
-- Google se separa por nombre de campaña: EP_Pmax_*, EP_Search_* y el resto (Shopping, Demand Gen).
WITH months AS (
  SELECT to_char(m, 'YYYY-MM') AS m
  FROM generate_series(date '2025-01-01', date_trunc('month', current_date - 1), interval '1 month') m
),
plat AS (
  SELECT unnest(ARRAY['meta', 'gsearch', 'pmax', 'gother', 'tiktok']) AS p
),
ads AS (
  SELECT 'meta' AS p, to_char(date, 'YYYY-MM') AS m,
         sum(amount_spent) AS spend, sum(link_click) AS clicks,
         sum(purchase) AS pconv, sum(purchase_value) AS pval
  FROM analytics.meta_account_daily WHERE date >= '2025-01-01' GROUP BY 1, 2
  UNION ALL
  SELECT CASE WHEN campaign_name ~* 'pmax' THEN 'pmax'
              WHEN campaign_name ~* 'search' THEN 'gsearch'
              ELSE 'gother' END,
         to_char(date, 'YYYY-MM'),
         sum(cost), sum(clicks), 0, 0
  FROM analytics.google_ads_daily WHERE date >= '2025-01-01' GROUP BY 1, 2
  UNION ALL
  SELECT 'tiktok', to_char(date, 'YYYY-MM'), sum(spend), sum(clicks), 0, 0
  FROM analytics.tiktok_ads_daily WHERE date >= '2025-01-01' GROUP BY 1, 2
),
ga AS (
  SELECT
    CASE
      WHEN source ~* '^tiktok' AND medium ~* '^(paid|paid_social|cpc)$' THEN 'tiktok'
      WHEN (source ~* '^(facebook|fb|ig|instagram)' AND medium ~* '^(paid|paid_social|cpc)$')
        OR (source IN ('fb', 'ig') AND medium ~* '^(instagram|facebook)_') THEN 'meta'
      WHEN channel = 'Cross-network' THEN 'pmax'
      WHEN channel = 'Paid Search' THEN 'gsearch'
      WHEN channel IN ('Paid Shopping', 'Paid Video', 'Display') THEN 'gother'
    END AS p,
    to_char(date, 'YYYY-MM') AS m,
    sum(sessions) AS s, sum(transactions) AS t, sum(purchase_revenue) AS r
  FROM analytics.ga4_landing_daily WHERE date >= '2025-01-01'
  GROUP BY 1, 2
)
SELECT
  plat.p, months.m,
  round(coalesce(sum(ads.spend), 0))::float AS spend,
  coalesce(sum(ads.clicks), 0)::float AS clicks,
  round(coalesce(sum(ads.pconv), 0)::numeric, 1)::float AS pconv,
  round(coalesce(sum(ads.pval), 0))::float AS pval,
  coalesce(max(ga.s), 0)::float AS s,
  coalesce(max(ga.t), 0)::float AS t,
  round(coalesce(max(ga.r), 0))::float AS r
FROM plat CROSS JOIN months
LEFT JOIN ads ON ads.p = plat.p AND ads.m = months.m
LEFT JOIN ga ON ga.p = plat.p AND ga.m = months.m
GROUP BY 1, 2
ORDER BY array_position(ARRAY['meta', 'tiktok', 'gsearch', 'pmax', 'gother'], plat.p), 2;

-- @query pedidos
-- Por mes calendario (hora de Argentina): pedidos de Tienda Nube pagados y no cancelados
-- (sin la tienda de mayoristas), transacciones de GA4, compras que se atribuye Meta y la
-- inversión total en pauta (Meta + Google + TikTok). tn_prev son los pedidos del mismo período
-- un año antes: en el mes en curso, sólo hasta el mismo momento (dia_actual = día del mes de hoy).
WITH now_ar AS (
  SELECT now() AT TIME ZONE 'America/Argentina/Buenos_Aires' AS t
),
months AS (
  SELECT m::date AS d, to_char(m, 'YYYY-MM') AS m
  FROM generate_series(date '2025-01-01', date_trunc('month', current_date - 1), interval '1 month') m
),
paid AS (
  SELECT placed_at AT TIME ZONE 'America/Argentina/Buenos_Aires' AS t
  FROM public.orders o
  WHERE channel = 'tiendanube' AND deleted_at IS NULL AND status <> 'cancelled'
    AND placed_at >= '2024-01-01 03:00+00'
    AND EXISTS (SELECT 1 FROM public.order_payments p WHERE p.order_id = o.id AND p.status = 'paid')
),
tn AS (
  SELECT
    months.m,
    count(*) FILTER (WHERE paid.t >= months.d AND paid.t < months.d + interval '1 month') AS n,
    count(*) FILTER (
      WHERE paid.t >= months.d - interval '1 year'
        AND paid.t < least(months.d - interval '1 year' + interval '1 month', (SELECT t FROM now_ar) - interval '1 year')
    ) AS prev
  FROM months CROSS JOIN paid
  GROUP BY 1
),
ga AS (
  SELECT to_char(date, 'YYYY-MM') AS m, sum(transactions) AS n
  FROM analytics.ga4_landing_daily WHERE date >= '2025-01-01' GROUP BY 1
),
meta AS (
  SELECT to_char(date, 'YYYY-MM') AS m, sum(purchase) AS n, sum(amount_spent) AS spend
  FROM analytics.meta_account_daily WHERE date >= '2025-01-01' GROUP BY 1
),
other AS (
  SELECT to_char(date, 'YYYY-MM') AS m, sum(cost) AS spend
  FROM analytics.google_ads_daily WHERE date >= '2025-01-01' GROUP BY 1
  UNION ALL
  SELECT to_char(date, 'YYYY-MM'), sum(spend)
  FROM analytics.tiktok_ads_daily WHERE date >= '2025-01-01' GROUP BY 1
)
SELECT
  months.m,
  coalesce(tn.n, 0)::int AS tn,
  coalesce(tn.prev, 0)::int AS tn_prev,
  CASE WHEN months.m = to_char((SELECT t FROM now_ar), 'YYYY-MM')
       THEN extract(day FROM (SELECT t FROM now_ar))::int END AS dia_actual,
  coalesce(ga.n, 0)::int AS ga,
  coalesce(meta.n, 0)::int AS meta,
  round(coalesce(meta.spend, 0) + coalesce((SELECT sum(spend) FROM other WHERE other.m = months.m), 0))::float AS spend
FROM months
LEFT JOIN tn USING (m)
LEFT JOIN ga USING (m)
LEFT JOIN meta USING (m)
ORDER BY months.m;
