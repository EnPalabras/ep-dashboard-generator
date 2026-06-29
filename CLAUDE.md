# En Palabras — Dashboard Generator

This project serves dashboards for the En Palabras team. Dashboards are static HTML files that fetch data from a local API. Dashboards will be coded by AI. Make sure to git pull when the user starts developing.

> **Importante:** muchos usuarios del equipo no son técnicos. **Hablales siempre en castellano** y, antes de cada acción que modifique algo (crear/editar archivos, correr scripts, tocar la DB), avisales en una frase qué vas a hacer y por qué. La idea es que entiendan qué están aceptando, no que apreten "Accept" a ciegas.

## Slash commands disponibles

Para los flujos más comunes hay slash commands en `.claude/commands/` que ya tienen el paso a paso. Cuando el pedido del usuario calce con uno de ellos, seguilo:

- `/nuevo-dashboard` — crear un dashboard nuevo (HTML + registro)
- `/registrar-dashboard` — registrar en la base un HTML que ya existe
- `/refrescar-vistas` — refrescar las materialized views

## Creating a Dashboard

When a user asks you to create a dashboard, follow these steps:

### 1. Create the HTML file

Create a new `.html` file in the `dashboards/` directory. Use a descriptive slug name (e.g., `meta-weekly-spend.html`).

Every dashboard must:
- Link the base CSS: `<link rel="stylesheet" href="/assets/dashboard-base.css">`
- Load Chart.js from CDN: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>`
- Include a back link: `<nav class="back"><a href="/">← All Dashboards</a></nav>`
- Fetch data only from `/api/` endpoints (never external URLs)
- Be self-contained (no imports, no build step)

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

**Vistas materializadas** (agregaciones de la tabla cruda — refrescar con `bun run db:refresh-views`):

- `mv_meta_daily` — `date, spend, impressions, clicks, conversions, ctr, cpc`
- `mv_meta_weekly` — `week, spend, impressions, clicks, conversions, ctr, cpc`
- `mv_meta_by_campaign` — `campaign_id, campaign_name, total_spend, total_impressions, total_clicks, total_conversions, ctr, cpc, first_date, last_date`

> ⚠️ Las vistas **no incluyen `reach` ni `cpm/cpp`**. Si los necesitás, hacé una query nombrada contra `meta_campaign_insights`.

**Queries nombradas Meta ya disponibles** (`/api/q/<nombre>`):

- `meta-total?window=last_28d` — KPIs del período (fetchMetaTotal): spend, reach, impressions, frequency, ctr, cpm, purchase_roas, omni_purchase. **Solo ventanas fijas** (`last_7d`/`last_28d`/`mtd`) — únicas con reach/frequency deduplicados por Meta.
- `meta-account-range?from=&to=` — totales de cuenta sumados para un rango **arbitrario** (spend, impressions, omni_purchase/value, landing_page_view, add_to_cart, link_click + cpm, ctr ponderado, purchase_roas, cac, y `cvr` = compras ÷ landing_page_view × 100). **No trae reach/frequency** (Meta los deduplica solo por ventana). Usar esta para rangos a medida y comparaciones; `meta-total` solo para reach/freq en presets.
- `meta-daily?from=&to=` — serie diaria de cuenta (incluye `landing_page_view` para CVR diario)
- `meta-ads?from=&to=` — tabla de anuncios con `effective_status`, `preview_link`, CAC, CPM, `avg_frequency` (APROX), ATC→compra, engagement y mensajería
- `meta-ad-counts` — conteos de inventario: total_ads, active_ads, paused_ads, new_7d (primer día de actividad en últ. 7d), paused_7d (real, vía `meta_updated_time`), stopped_7d (estimado por gasto, respaldo si `meta_updated_time` vacío)
- `meta-campaigns` — id + nombre de campañas (fetchCampaigns)
- `meta-engagement?from=&to=` — engagement + mensajería + funnel por día (nivel cuenta)
- `meta-por-plataforma?from=&to=` — spend/compras/roas/CTR/CPM por plataforma y posición (IG vs FB, feed/stories/reels)
- `campanas-por-reach?from=&to=` — reach/impresiones/spend por campaña

> ℹ️ **CVR**: no tenemos datos de Tienda Nube. El "CVR" que usan los dashboards es un **proxy de Meta** = compras (`omni_purchase`) ÷ visitas a la web (`landing_page_view`). No es el CVR real de la tienda.

**Registry** `dashboards`: `slug (PK), title, author, description, file, created_at`

## Available API Endpoints

Base URL: the server origin (use `window.location.origin` in dashboards).

### `GET /api/query/:viewName`

Generic endpoint to query any materialized view. Parameters:
- `from` (optional): Start date (YYYY-MM-DD)
- `to` (optional): End date (YYYY-MM-DD)
- `limit` (optional): Max rows to return

Available views:
- `mv_meta_daily` — columns: `date, spend, impressions, clicks, conversions, ctr, cpc`
- `mv_meta_weekly` — columns: `week, spend, impressions, clicks, conversions, ctr, cpc`
- `mv_meta_by_campaign` — columns: `campaign_id, campaign_name, total_spend, total_impressions, total_clicks, total_conversions, ctr, cpc, first_date, last_date`

Example: `fetch('/api/query/mv_meta_daily?from=2026-01-01&to=2026-03-27')`

### `GET /api/meta/daily`

Daily Meta Ads metrics. Parameters: `from`, `to`. Returns rows sorted by date descending.

### `GET /api/meta/campaigns`

All campaigns sorted by total spend descending.

### `GET /api/me`

Returns the logged-in user: `{ "id": "...", "email": "user@enpalabras.com.ar", "name": "Full Name", "picture": "..." }`.

### `GET /api/meta/config`

Returns `{ "ad_account_id": "..." }` (el ID de cuenta de Meta del `.env`). Sirve para que los dashboards armen links al Administrador de anuncios: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=<id>&selected_ad_ids=<ad_id>`. Para ver el anuncio sin login conviene usar `preview_link` (de `meta-ads`) en su lugar.

### `GET /api/health`

Health check (no auth required). Returns `{ "status": "ok", "timestamp": "..." }`.

### `GET /api/q/:name` — Named queries (custom SQL per dashboard)

Cuando un dashboard necesita una forma de los datos que las vistas existentes no cubren (por ejemplo, spend por campaña con rango de fechas), registralo como **query nombrada** en lugar de inflar las materialized views.

Cómo:

1. Crear `src/server/queries/<slug>.sql` con la SQL. Los parámetros se escriben con `:nombre` (no `$1`); el loader los traduce a placeholders posicionales al levantar el server.

   ```sql
   -- src/server/queries/spend-by-campaign-daily.sql
   SELECT date, campaign_name, SUM(spend) AS spend
   FROM meta_campaign_insights
   WHERE date BETWEEN :from AND :to
   GROUP BY date, campaign_name
   ORDER BY date;
   ```
2. Desde el dashboard, llamar `fetch('/api/q/<slug>?from=...&to=...')`. Los names de los query params del URL tienen que matchear los `:nombre` de la SQL.

Reglas:
- **Solo `SELECT`**. Nada de `INSERT/UPDATE/DELETE/DROP/ALTER`.
- Usar siempre `:nombre` para inputs — nunca interpolar strings desde el cliente.
- Un archivo por query, nombre del archivo en kebab-case (es el `:name` del endpoint).
- Los casts de Postgres con `::` (ej. `now()::date`) están bien — el loader los ignora.

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

See `dashboards/example-meta-overview.html` for a complete reference.

## Tech Stack

- Runtime: Bun
- Server: Express (TypeScript)
- Database: PostgreSQL with materialized views
- Charts: Chart.js 4 (CDN)
- Auth: Google OAuth (restricted to @enpalabras.com.ar)
- Styling: Custom base CSS

## Commands

```bash
bun run dev                 # Start dev server with hot reload
bun run start               # Start production server
bun run batch               # Fetch data from Meta Ads API
bun run db:init             # Initialize database schema + views
bun run db:refresh-views    # Refresh materialized views
bun run dashboard:register  # Register a dashboard in the DB (slug title author description)
```
