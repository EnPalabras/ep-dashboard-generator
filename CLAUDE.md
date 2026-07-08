# En Palabras — Dashboard Generator

This project serves dashboards for the En Palabras team. Dashboards are static HTML files that fetch data from a local API. Dashboards will be coded by AI. Make sure to git pull when the user starts developing.

> **Importante:** muchos usuarios del equipo no son técnicos. **Hablales siempre en castellano** y, antes de cada acción que modifique algo (crear/editar archivos, correr scripts, tocar la DB), avisales en una frase qué vas a hacer y por qué. La idea es que entiendan qué están aceptando, no que apreten "Accept" a ciegas.

## Slash commands disponibles

Para los flujos más comunes hay slash commands en `.claude/commands/` que ya tienen el paso a paso. Cuando el pedido del usuario calce con uno de ellos, seguilo:

- `/nuevo-dashboard` — crear un dashboard nuevo (HTML + SQL co-locada + registro)
- `/registrar-dashboard` — registrar en la base un HTML que ya existe

## Creating a Dashboard

When a user asks you to create a dashboard, follow these steps:

### 1. Create the HTML file (+ su SQL hermano)

Create a new `.html` file in the `dashboards/` directory. Use a descriptive slug name (e.g., `meta-weekly-spend.html`). Sus queries van **co-locadas** en `dashboards/<slug>.sql` (ver sección "Named queries" abajo).

Every dashboard must:
- Link the base CSS: `<link rel="stylesheet" href="/assets/dashboard-base.css">`
- Load Chart.js from CDN: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>`
- Include a back link: `<nav class="back"><a href="/">← All Dashboards</a></nav>`
- Fetch data only from `/api/` endpoints (never external URLs) — sus queries desde `dashboards/<slug>.sql` vía `/api/q/<slug>/<query>`
- Be self-contained (no imports, no build step)
- Charts: antes de escribir código de gráficos, cargá el skill `dataviz`. Paleta de la casa: violeta EP `#774293`.

### 2. Register the dashboard in the database

**Usá siempre el script wrapper, nunca SQL crudo:**

```bash
bun run dashboard:register <slug> "<title>" "<author>" "<description>"
```

Eso hace un INSERT en la tabla `dashboards` (o UPDATE si el slug ya existe). El argumento `file` es opcional y por defecto es `<slug>.html`.

Ask the user for their name if you don't know who they are.

## Schema de la base (rápido)

Fuente de verdad: `src/batch/meta/schema.sql`. Esto es para leer rápido.

**Tabla cruda** `meta_campaign_insights` (un row por `campaign_id × adset_id × ad_id × date`):

- Identificación: `campaign_id`, `campaign_name`, `adset_id`, `adset_name`, `ad_id`, `ad_name`, `date`
- Métricas base: `spend`, `impressions`, `clicks`, `conversions`, `reach`, `cpm`, `cpp`, `ctr`, `cpc`, `frequency`, `purchase_roas`, `omni_purchase`, `omni_purchase_value`
- Funnel (conteos): `purchase` (compra web/pixel, ≠ `omni_purchase`), `purchase_value`, `add_to_cart`, `initiate_checkout`, `view_content`, `landing_page_view`
- Engagement (conteos): `post_save`, `comment`, `link_click`, `shares` (action_type `post`), `post_reaction`
- Mensajería: `messaging_first_reply` (contactos nuevos), `messaging_started` (conversaciones iniciadas 7d)
- Calidad/costo: `quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking` (TEXT, suelen `UNKNOWN`/vacíos en histórico), `buying_type`, `cpa_purchase`, `website_purchase_roas`
- Meta: `objective`, `created_at`

> ℹ️ Los rankings vienen de Meta solo para ventanas recientes; en fechas viejas quedan vacíos. `attribution_setting` NO se puede pedir junto a las métricas (Meta deja de devolver impressions/actions), por eso no está.

> ⚠️ `reach`, `frequency` y `purchase_roas` se guardan por fila pero **no se suman** entre anuncios ni días (reach son personas únicas). Para totales correctos a nivel cuenta usá las tablas de cuenta de abajo.

**Nivel cuenta** (vienen de llamadas `level=account` aparte — reach/frequency desduplicados por Meta):

- `meta_account_daily` — una fila por día: `account_id, date, amount_spent, impressions, reach, frequency, ctr, cpm, purchase_roas, omni_purchase, omni_purchase_value` + funnel/engagement/mensajería (`purchase, purchase_value, add_to_cart, initiate_checkout, view_content, landing_page_view, post_save, comment, link_click, shares, post_reaction, messaging_first_reply, messaging_started`)
- `meta_account_totals` — una fila por ventana (`window_label` ∈ `last_7d`, `last_28d`, `mtd`): mismos campos + `period_from, period_to`

**Breakdown por plataforma** `meta_platform_insights` (un row por `campaign × adset × ad × date × publisher_platform × platform_position`): `spend, impressions, clicks, reach, frequency, ctr, cpm, cpc, omni_purchase, omni_purchase_value, purchase, purchase_value, add_to_cart`. `publisher_platform` ∈ `facebook, instagram, audience_network, threads, messenger`; `platform_position` ∈ `feed, instagram_stories, instagram_reels, ...`.

> ⚠️ En `meta_platform_insights` el `reach` **no se suma** entre plataformas/posiciones (Meta lo deduplica). Usalo para `spend`/`compras`/`roas` por plataforma, no para reach total.

**Snapshot de anuncios** `meta_ad_entities` (una fila por anuncio, estado actual): `ad_id (PK), ad_name, campaign_id, campaign_name, adset_id, effective_status, meta_updated_time, preview_link, updated_at`

> ℹ️ `meta_updated_time` = última modificación del ad según Meta (`updated_time`); sirve para estimar pausas recientes (ej. "pausados últimos 7 días" = `effective_status LIKE '%PAUSED%' AND meta_updated_time >= now()-7d`). `preview_link` = `preview_shareable_link` de Meta, un link público para ver el anuncio sin entrar al Administrador. Ambos se pueblan en el batch (`storeAdEntities`). No hay historial de estado: es una foto que se sobrescribe cada corrida.

> ℹ️ **No hay más `mv_meta_*` ni queries `meta-*` globales.** Las queries nombradas ahora viven **co-locadas por dashboard** en `dashboards/<slug>.sql` (ver "Named queries" abajo). Para KPIs de Meta, consultá las tablas de arriba directamente desde la `.sql` de tu dashboard.

## GA4 (Google Analytics)

Segunda fuente de datos, además de Meta. Mismo patrón: batch en `src/batch/ga4/` (pega a la **Google Analytics Data API v1beta**, `runReport`) → upsert en Postgres → queries nombradas. Corre dentro del mismo `bun run batch` (con try/catch propio: si GA4 falla, Meta sigue). Datos cargados desde `2025-01-01` (igual rango que Meta).

**Auth:** service account (rol Lector en la property). Variables de entorno: `GA_PROPERTY_ID`, `GA_SERVICE_ACCOUNT_EMAIL`, `GA_PRIVATE_KEY`, `GA_PROJECT_ID`. El token se firma con `crypto` nativo (sin dependencias nuevas). Schema en `src/batch/ga4/schema.sql`.

**Tablas** (nivel cuenta/día, no se cruzan con las de Meta):

- `ga4_traffic_daily` — una fila por `date × channel × source × medium`: `sessions, total_users, new_users, engaged_sessions, engagement_rate` (0..1), `avg_session_duration` (seg), `conversions`, `total_revenue`. `channel` = `sessionDefaultChannelGroup` de GA4 (`Organic Search`, `Paid Social`, `Direct`, `Paid Search`, `Email`, `Referral`, `Unassigned`, ...). El canal **`Paid Social`** es el tráfico que trae Meta → sirve para cruzar contra las métricas de Meta.
- `ga4_events_daily` — una fila por `date × event_name`: `event_count`, `conversions`. Eventos de GA4 (`page_view`, `view_item`, `session_start`, `add_to_cart`, `begin_checkout`, etc.).

> ⚠️ **Evento de compra = `purchase`** (es el único key event marcado como conversión: su `conversions` = `event_count`). **NO usar `compra_producto`**: pese al nombre, es una **vista de producto** (magnitud ~= `view_item`, `conversions`=0), no una compra. `ga4_traffic_daily.conversions` cuenta los key events (≈ purchases).
> ℹ️ Sanity check (últ. 28d): GA4 `purchase` ≈ 1.516 vs Meta `omni_purchase` ≈ 989 (GA4 ve todo el sitio, Meta solo lo atribuido → GA4 > Meta). AOV casi igual (~$52k), así que ambos miden compras reales. No es Tienda Nube: es lo que mide el tag de GA4.
> ⚠️ El canal `Unassigned` puede traer `total_revenue` negativo (devoluciones/ajustes que GA4 no atribuye a un canal). Es esperado, no es un bug.

**Registry** `analytics.dashboards`: `slug (PK), title, author, description, file, created_at` (lo llena `bun run dashboard:register`).

## Base de datos (una sola: `server_en_palabras`)

> **Única base:** la de producción del e-commerce (`server_en_palabras`, `DATABASE_URL`, usuario `ep_analytics`). La DB vieja de este repo (gondola) quedó **jubilada**. Todo vive acá: `public` (ventas/negocio, read-only) y `analytics` (Meta/GA4/funnel/IG + `dashboards`).

Permisos de `ep_analytics`: `SELECT` en `public` (no escribe ahí), `SELECT` en `analytics`, y **dueño** de las tablas que crea en `analytics` (las nuestras ricas + `dashboards`). Para alimentar las tablas **existentes** de `analytics` (las de Metabase: `instagram_by_day`, `sessions_per_month`, `events_per_month_page`, `checkout_dropoff_funnel`, `users_cr_by_product`) necesita `INSERT/UPDATE` — ver "Batch / ingest" abajo.

## Batch / ingest de datos (corre acá — `bun run batch`)

Todo el intake de analíticas vive en `src/batch/`, orquestado por `run.ts` (cada fuente en su try/catch; una que falle no tumba al resto). Sin dependencias nuevas: todo `fetch` + `crypto`.

- **`meta/`** (rico, nuestro) → `analytics.meta_campaign_insights`, `meta_account_daily`, `meta_account_totals`, `meta_platform_insights`, `meta_ad_entities`. Env: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`. **Tablas nuestras (ep_analytics las posee) — sin grant extra.**
- **`ga4/`** (rico, nuestro) → `analytics.ga4_traffic_daily`, `ga4_events_daily`. Env: `GA_*`. **Tablas nuestras.**
- **`ga4-reports/`** (portado de server_en_palabras) → tablas **existentes** `sessions_per_month`, `events_per_month_page`, `users_cr_by_product`, `checkout_dropoff_funnel`. Usa `runReport` + `runFunnelReport` (v1alpha). **Necesita `INSERT/UPDATE` en esas tablas.**
- **`instagram/`** (portado) → tabla **existente** `instagram_by_day`. Env: `META_INSTAGRAM_ACCOUNT_ID` + `META_ACCESS_TOKEN` (token con permisos `instagram_*`). **Necesita `INSERT/UPDATE`.**
- **`tiktok/`** (rico, nuestro) → `analytics.tiktok_ads_daily` (anuncio × día: spend, impresiones, clicks, ctr/cpc/cpm, conversiones, reach, likes/comments/shares/profile_visits). Business API v1.3 `report/integrated/get` (fetch plano, sin SDK). Env: `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID`. **Tabla nuestra — sin grant.** Datos desde 2025-08 (inicio de la cuenta).

> ⚠️ **Grant pendiente** para que el batch alimente las tablas existentes de Metabase (correr como `postgres`):
> ```sql
> GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA analytics TO ep_analytics;
> GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA analytics TO ep_analytics;
> ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT INSERT, UPDATE, DELETE ON TABLES TO ep_analytics;
> ```
> Sin el grant, `meta/` y `ga4/` (tablas nuestras) funcionan igual; `ga4-reports/` e `instagram/` fallan con `permission denied` (42501) hasta correrlo. `meta_ad_report` queda intacta/vacía a propósito (usamos las tablas Meta ricas).

> ⚠️ **Qué cuenta como venta.** `Orders.status` es estado de *gestión*, no de pago, y **varía por canal** (TiendaNube `open`, MercadoLibre `paid`, Coshowroom `closed`). El indicador real es el **pago**: venta = orden **no cancelada** con al menos un `OrdersPayments.payment_status IN ('paid','approved')`. Revenue = `Orders.total_amount`. Toda query de ventas filtra así (ver `ventas-*.sql`).

**Tablas útiles de `public`** (schema completo en `server_en_palabras/prisma/schema.prisma`): `Orders` (idEP, channel, status, total_amount, date_created, mail…), `OrdersItems` (product, quantity, total_product_amount), `OrdersPayments` (payment_method, payment_status, payment_received_amount), `OrdersShipping` (carrier, costos, zona), `gastos` (por categoría/área), `cmv_products` (CMV/COGS por producto/mes), `invoices` (facturación AFIP). Los nombres `PascalCase` y la columna `idEP` van **entre comillas** (`public."Orders"`, `o."idEP"`).

**Dashboards ya armados** (cada uno con su `dashboards/<slug>.html` + `<slug>.sql`):

- **`ventas-reales`** (`public`): resumen, por-canal, diario, por-pago, top-productos.
- **`conversion`** (`analytics`): funnel de checkout semanal + CVR vista→compra por producto.
- **`instagram`** (`analytics`): cuenta/día + engagement + **top contenido** (posts por alcance).
- **`negocio-360`** (`public`+`analytics`): panorama ejecutivo (ventas, resultado, gastos, ROI mkt, sesiones) **con comparador de período** (rango + período anterior/YoY + deltas).
- **`paid-media`** (`analytics`): Meta Ads vs TikTok Ads, mismo comparador de período.

> 💡 El comparador de `negocio-360`/`paid-media` (rango configurable + período anterior/YoY + deltas coloreados) es el **molde reutilizable** para dashboards nuevos que necesiten comparación.

## Available API Endpoints

Base URL: the server origin (use `window.location.origin` in dashboards).

> El endpoint principal es **`/api/q/:slug/:query`** (named queries co-locadas, abajo). Además hay algunos utilitarios:

### `GET /api/me`

Returns the logged-in user: `{ "id": "...", "email": "user@enpalabras.com.ar", "name": "Full Name", "picture": "..." }`.

### `GET /api/meta/config`

Returns `{ "ad_account_id": "..." }` (el ID de cuenta de Meta del `.env`). Sirve para que los dashboards armen links al Administrador de anuncios: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=<id>&selected_ad_ids=<ad_id>`. Para ver el anuncio sin login conviene usar `preview_link` (de `analytics.meta_ad_entities`) en su lugar.

### `GET /api/health`

Health check (no auth required). Returns `{ "status": "ok", "timestamp": "..." }`.

### `GET /api/q/:slug/:query` — Named queries (co-locadas por dashboard)

Cada dashboard tiene **sus queries en un archivo hermano del HTML**: `dashboards/<slug>.html` + `dashboards/<slug>.sql`. Un dashboard = dos archivos; borrás el dashboard, borrás su SQL, sin queries huérfanas.

Dentro del `.sql`, cada query se separa con el marcador **`-- @query <nombre>`**. El endpoint es **`/api/q/<slug>/<nombre>`**.

```sql
-- dashboards/ventas-reales.sql

-- @query resumen
SELECT count(*)::int AS ordenes, sum(total_amount) AS revenue
FROM public."Orders" o
WHERE o.date_created::date BETWEEN :from AND :to;

-- @query por-canal
SELECT channel, sum(total_amount) AS revenue
FROM public."Orders" o
WHERE o.date_created::date BETWEEN :from AND :to
GROUP BY channel ORDER BY revenue DESC;
```

Desde el HTML: `fetch('/api/q/ventas-reales/resumen?from=...&to=...')`. Los query params del URL tienen que matchear los `:nombre` de la SQL.

Reglas:
- **Solo `SELECT`** (el usuario `ep_analytics` no puede escribir en `public`, pero igual: nada de `INSERT/UPDATE/DELETE/DROP/ALTER`).
- Usar siempre `:nombre` para inputs — nunca interpolar strings desde el cliente. El loader traduce `:nombre` → `$n` al levantar el server.
- Marcador exacto `-- @query <nombre>` (kebab-case) en su propia línea. El texto antes del primer marcador es header/comentario, se ignora.
- Nombres `PascalCase` de tabla y la columna `idEP` van entre comillas: `public."Orders"`, `o."idEP"`.
- Los casts `::` (ej. `now()::date`) están bien.

## Available CSS Classes

The base stylesheet (`/assets/dashboard-base.css`) provides:
- `.card` — white card with border and padding
- `.grid` — responsive auto-fit grid (min 280px columns)
- `.metric` — centered metric display (use with `.card`)
- `.metric .value` — large number
- `.metric .label` — small label below
- `.chart-container` — responsive container for Chart.js canvases (400px height)
- `nav.back` — back navigation link

## Example Dashboard

Referencias: `dashboards/ventas-reales.html` (simple, tablas + charts) y `dashboards/negocio-360.html` (con el comparador de período reutilizable). Cada uno con su `.sql` hermano.

## Tech Stack

- Runtime: Bun
- Server: Express (TypeScript)
- Database: PostgreSQL (una sola: la de `server_en_palabras`)
- Charts: Chart.js 4 (CDN)
- Auth: Google OAuth (restringido a @enpalabras.com.ar)
- Styling: Custom base CSS (`/assets/dashboard-base.css`)

## Commands

```bash
bun run dev                 # Levantar server de desarrollo (hot reload)
bun run start               # Server de producción
bun run batch               # Traer datos de todas las fuentes (Meta, GA4, GA4-reports, IG, TikTok)
bun run dashboard:register  # Registrar un dashboard en la DB (slug title author description)
bun run query:check         # Probar una named query: query:check <slug>/<query> [from=.. to=..]
```

> Backfill de Meta por meses (la API rechaza rangos largos): `bun run scripts/backfill-meta.ts [from] [to]`.
