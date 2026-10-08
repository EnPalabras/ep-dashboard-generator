# Base de datos de En Palabras (v2) — guía para consultar

Postgres, sólo lectura. Dos schemas: `public` (ventas, pagos, envíos, stock: lo escribe
`en-palabras-core`) y `analytics` (marketing y tráfico: lo escribe el batch del generador cada 12 h).
Fechas en `timestamptz` (UTC): para agrupar por día de Argentina usá
`(placed_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`. Plata en pesos, `double precision`.

## Ventas (`public`)

- `channels`: `id` = `tiendanube`, `mercadolibre`, `coshowroom`, `mayoristas` (con intake hoy) y
  `empresas`, `empretienda`, `bioferia`, `personal`, `regalo` (sólo historia, importados del sistema viejo).
- `orders`: una fila por orden. Clave natural `(channel, channel_order_id)`.
  - `placed_at` es **la fecha de negocio** (cuándo se hizo la compra). Reportá por `placed_at`, no por `created_at`.
  - `status`: `open`, `closed`, `cancelled`. En Mercado Libre nunca llega a `closed`.
  - `total`, `subtotal`, `discount_total`, `shipping_total`. `channel_order_number` es el número que ve
    el cliente (TN `#107071`); ML no tiene.
  - Filtrá siempre `deleted_at IS NULL`.
  - Atribución de TN: `landing_page`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.
  - Los packs de ML son una sola orden (`channel_order_id` = `pack_id`).
- **Una venta** = orden no cancelada con al menos un pago `paid`:
  ```sql
  WHERE o.deleted_at IS NULL AND o.status <> 'cancelled'
    AND EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id AND p.status = 'paid')
  ```
  Con esto los pedidos de Tienda Nube por mes coinciden con los de la tienda.
- `order_items`: renglones (`quantity`, `unit_price`, `product_name`, `sku` tal como lo manda el canal,
  `variant_id` → `product_variants` → `products`). `variant_id` null en un combo de TN es a propósito.
  `source` dice si el renglón vino de cross-sell.
- `order_payments`: un pago por fila. `status` (`pending`, `authorized`, `paid`, `voided`, `refunded`,
  `abandoned`), `payment_method` (`cash`, `credit_card`, `debit_card`, `prepaid_card`, `transfer`,
  `wallet`, `voucher`, `free`, `other`), `gateway`, `gross_amount` (lo que pagó el cliente),
  `net_amount` (lo que nos queda después de comisiones), `installments`, `paid_at`.
- `payment_charges`: comisiones, impuestos y financiación de cada pago (`type`, `amount`). Ahí vive la
  comisión de ML y de Mercado Pago, no en los ítems.
- `order_discounts`: descuentos con la granularidad que da el canal (`promotion`, `coupon`, `gateway`). No se prorratean.
- `order_shipping` (`carrier` elegido, `carrier_real` = quién lo llevó; leé `coalesce(carrier_real, carrier)`,
  `shipping_mode` `ship`/`pickup`), `order_shipping_events` (historia: `delivered`, `returned`, …),
  `order_shipping_address`.
- `customers`: por canal (`(channel, channel_customer_id)`): la misma persona en TN y en ML son dos filas.
- `products`, `product_variants`, `skus`, `sku_aliases` (traduce el `sku` de cada sistema al canónico),
  `sku_components` (cajas/combos).
- `stock_snapshots`: foto diaria de stock por depósito (`urbano`, `shipnow`, `mercadolibre` Full, `coshowroom`).
- `sales_projections` / `sales_vs_projections`: proyección de ventas por día, canal y SKU.
- `logistics_charges`: costos de logística por proveedor (ShipNow, Urbano, CoShowroom), con `order_id` cuando se pudo vincular.

## Marketing y tráfico (`analytics`)

- `ga4_landing_daily`: GA4 por día × landing page × canal × source × medium: `sessions`,
  `engaged_sessions`, `transactions` (compras), `purchase_revenue`. Es la tabla para conversión por página o canal.
- `ga4_traffic_daily`: GA4 por día × canal × source × medium, con usuarios y duración. Su `conversions`
  suma **todos** los key events, no sólo compras: para ventas usá `transactions` de `ga4_landing_daily`.
- `ga4_events_daily`, `events_per_month_page`, `checkout_dropoff_funnel`, `users_cr_by_product`, `sessions_per_month`.
- `meta_account_daily`: Meta a nivel cuenta por día (`amount_spent`, `purchase`, `purchase_value`,
  `link_click`, reach). Para totales de Meta usá esta. Hay dos cuentas (`account_id`): la vieja hasta
  mediados de sep-2026 y la nueva desde el 11/09/2026; sumalas.
- `meta_campaign_insights`: por anuncio y día (`campaign_name`, `adset_name`, `ad_name`, `spend`,
  `purchase`, …). `reach` y `frequency` no se suman entre filas.
- `meta_platform_insights` (por plataforma/ubicación), `meta_ad_entities` (estado actual de cada anuncio).
- `google_ads_daily`: costo, clics e impresiones por campaña y día. **Sale de GA4** (cuenta vinculada):
  `key_events` no son las conversiones de Google Ads. Campañas: `EP_Pmax_*`, `EP_Search_*`, el resto Shopping/Video.
- `tiktok_ads_daily` (desde ago-2025), `mercadolibre_ads_daily` (Product Ads de ML).
- `combined_report_by_day`: inversión diaria de todos los canales juntos.
- `gsc_site_daily`, `gsc_page_daily`, `gsc_query_daily`: Google Search Console.
- `instagram_by_day`, `instagram_posts`: orgánico de Instagram.
- `logistics_spending`, `cmv_products`, `marketing_spend_manual`, `influencer_costs`: planillas manuales viejas.

## Etiquetas de GA4

"Meta pago" junta `facebook / paid_social`, `ig / paid`, `fb / paid` y las variantes por ubicación
(`ig / Instagram_Stories`, …); "TikTok pago" es `tiktok / paid` y `tiktok / paid_social`. Las
etiquetas cambiaron a mediados de sep-2025. "Cross-network" en GA4 es Google PMax.
