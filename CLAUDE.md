# En Palabras — Dashboard Generator

This project serves dashboards for the En Palabras team. Dashboards are static HTML files that fetch data from a local API. Dashboards will be coded by AI. Make sure to git pull when the user starts developing.

> **Importante:** muchos usuarios del equipo no son técnicos. **Hablales siempre en castellano** y, antes de cada acción que modifique algo (crear/editar archivos, correr scripts, tocar la DB), avisales en una frase qué vas a hacer y por qué. La idea es que entiendan qué están aceptando, no que apreten "Accept" a ciegas.

## Slash commands disponibles

Para crear o cambiar un dashboard seguí `/nuevo-dashboard` (`.claude/commands/nuevo-dashboard.md`).

## Dashboards: viven en la base, no en el repo

Cada dashboard es un HTML y un SQL guardados en `analytics.dashboards` (base de **v2**), con su historial en
`analytics.dashboard_versions`. Publicar es instantáneo: no hay commit ni deploy. `dashboards/` está en
`.gitignore`; es sólo la copia de trabajo de este script:

```bash
bun run dashboard pull <slug>                                    # baja HTML + SQL a dashboards/ (y la versión)
bun run dashboard check <slug> [from=.. to=..]                   # prueba las queries del .sql local
bun run dashboard publish <slug> "<título>" "<descripción>" [nota]   # valida, prueba y publica
```

`publish` publica sobre la versión que bajaste con `pull` (0 si es nuevo): si alguien publicó otra en el
medio, se rechaza en vez de pisarla. El autor sale de `git config user.name` (o `--autor=`).

Reglas y guía de la base: **`docs/conector/dashboards.md`** y **`docs/conector/base.md`**. Son las mismas que
lee el conector de Claude.

## Conector de Claude (`/mcp`)

Servidor MCP en el mismo proceso (`src/server/mcp/`) para que cualquiera del equipo, desde claude.ai, consulte
la base y publique dashboards sin tener el repo. OAuth propio sobre el login de Google del generador
(`@enpalabras.com.ar`); los tokens son HMAC firmados con `MCP_SIGNING_SECRET`, sin tabla. Herramientas:
`describir_base`, `consultar`, `guia_dashboards`, `listar_dashboards`, `ver_dashboard`, `probar_sql`,
`publicar_dashboard`, `historial_dashboard`, `restaurar_version`.

Todo lo que corre SQL del usuario (el conector y `/api/q`) pasa por `src/server/mcp/readonly.ts`: rol
`ep_readonly` (`DATABASE_URL_READONLY`, ver `docs/conector/rol-readonly.sql`), transacción `READ ONLY`,
protocolo extendido (una sola sentencia) y 5 min de timeout. `consultar` devuelve CSV, hasta 50.000 filas o
200.000 caracteres (`MCP_MAX_ROWS`, `MCP_MAX_CHARS`).

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

> ℹ️ **No hay más `mv_meta_*` ni queries `meta-*` globales.** Cada dashboard trae sus queries en su propio SQL (ver "Named queries" abajo).

## GA4 (Google Analytics)

Segunda fuente de datos, además de Meta. Mismo patrón: batch en `src/batch/ga4/` (pega a la **Google Analytics Data API v1beta**, `runReport`) → upsert en Postgres → queries nombradas. Corre dentro del mismo `bun run batch` (con try/catch propio: si GA4 falla, Meta sigue). Datos cargados desde `2025-01-01` (igual rango que Meta).

**Auth:** service account (rol Lector en la property). Variables de entorno: `GA_PROPERTY_ID`, `GA_SERVICE_ACCOUNT_EMAIL`, `GA_PRIVATE_KEY`, `GA_PROJECT_ID`. El token se firma con `crypto` nativo (sin dependencias nuevas). Schema en `src/batch/ga4/schema.sql`.

**Tablas** (nivel cuenta/día, no se cruzan con las de Meta):

- `ga4_traffic_daily` — una fila por `date × channel × source × medium`: `sessions, total_users, new_users, engaged_sessions, engagement_rate` (0..1), `avg_session_duration` (seg), `conversions`, `total_revenue`. `channel` = `sessionDefaultChannelGroup` de GA4 (`Organic Search`, `Paid Social`, `Direct`, `Paid Search`, `Email`, `Referral`, `Unassigned`, ...). El canal **`Paid Social`** es el tráfico que trae Meta → sirve para cruzar contra las métricas de Meta.
- `ga4_events_daily` — una fila por `date × event_name`: `event_count`, `conversions`. Eventos de GA4 (`page_view`, `view_item`, `session_start`, `add_to_cart`, `begin_checkout`, etc.).

> ⚠️ **Evento de compra = `purchase`** (es el único key event marcado como conversión: su `conversions` = `event_count`). **NO usar `compra_producto`**: pese al nombre, es una **vista de producto** (magnitud ~= `view_item`, `conversions`=0), no una compra. `ga4_traffic_daily.conversions` cuenta los key events (≈ purchases).
> ℹ️ Sanity check (últ. 28d): GA4 `purchase` ≈ 1.516 vs Meta `omni_purchase` ≈ 989 (GA4 ve todo el sitio, Meta solo lo atribuido → GA4 > Meta). AOV casi igual (~$52k), así que ambos miden compras reales. No es Tienda Nube: es lo que mide el tag de GA4.
> ⚠️ El canal `Unassigned` puede traer `total_revenue` negativo (devoluciones/ajustes que GA4 no atribuye a un canal). Es esperado, no es un bug.

**Dashboards** `analytics.dashboards` (v2): `slug (PK), title, author, description, html, sql, version, updated_at, updated_by, created_at` + `analytics.dashboard_versions` (una fila por publicación).

## Base de datos: la de v2 (proyecto `EP Core` en Railway)

Una sola base, la de `en-palabras-core`: `public` (ventas, pagos, envíos, stock; la escribe el core) y
`analytics` (lo de este repo). **El legacy (`server_en_palabras`) ya no se lee ni se escribe desde acá**
(desde el 2026-10-08). Tres roles, uno por uso:

| Rol | Quién | Puede |
|---|---|---|
| `ep_analytics` | el batch (`DATABASE_URL` del Action, secret `DATABASE_URL_SECONDARY`) | dueño de `analytics`, `SELECT` en `public` |
| `ep_dashboards` | el server web (`DATABASE_URL` en Railway) | leer y escribir `dashboards` / `dashboard_versions` y nada más |
| `ep_readonly` | `/api/q` y el conector (`DATABASE_URL_READONLY`) | `SELECT` en `public` y `analytics` |

> ⚠️ **En GitHub el secret que vale es `DATABASE_URL_SECONDARY`** (v2, `ep_analytics`): el workflow lo pasa como
> `DATABASE_URL`. El secret `DATABASE_URL` apunta al **legacy** y ya no se usa. Ese mapeo es lo que cortó la
> escritura del batch en el legacy el 2026-10-08: si alguien vuelve a poner `secrets.DATABASE_URL`, el batch
> escribe otra vez en el legacy y deja de alimentar v2. Las tablas de `analytics` del legacy (y lo que las lea
> en Metabase) quedaron congeladas en esa fecha.

Los roles se crean con `docs/conector/rol-*.sql`. Las tablas se crean con `bun run db:init` (todos los
`schema.sql`, idempotente).

## Batch / ingest de datos (corre acá — `bun run batch`)

Todo el intake de analíticas vive en `src/batch/`, orquestado por `run.ts` (cada fuente en su try/catch; una que falle no tumba al resto). Sin dependencias nuevas: todo `fetch` + `crypto`.

- **`meta/`** (rico, nuestro) → `analytics.meta_campaign_insights`, `meta_account_daily`, `meta_account_totals`, `meta_platform_insights`, `meta_ad_entities`. Env: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_IDS` (lista separada por comas; la vigente va última: desde el 2026-09-11 se gasta en `3378020092308629`, la prepaga `715603162702046` quedó sin saldo). **Tablas nuestras (ep_analytics las posee) — sin grant extra.**
- **`ga4/`** (rico, nuestro) → `analytics.ga4_traffic_daily`, `ga4_events_daily`. Env: `GA_*`. **Tablas nuestras.**
- **`ga4-reports/`** → `sessions_per_month`, `events_per_month_page`, `users_cr_by_product` (sólo las variantes que conoce v2: `product_variants` + `order_items`), `checkout_dropoff_funnel`. Usa `runReport` + `runFunnelReport` (v1alpha).
- **`instagram/`** → `instagram_by_day`. Env: `META_INSTAGRAM_ACCOUNT_ID` + `META_ACCESS_TOKEN` (token con permisos `instagram_*`).
- **`google-ads/`** (rico, nuestro) → `analytics.google_ads_daily` (campaña × día: `cost`, `clicks`, `impressions`, `key_events`, `total_revenue`). **No usa la API de Google Ads**: el costo sale de GA4 (`advertiserAdCost`, `advertiserAdClicks`, `advertiserAdImpressions`) porque la cuenta está vinculada a la property, así que reusa las mismas `GA_*`. Verificado contra la planilla de Windsor: coincide **al peso** mes a mes de 2025-01 a 2026-03. **Tabla nuestra — sin grant.**
- **`gsc/`** (rico, nuestro) → `analytics.gsc_site_daily` (país × dispositivo), `gsc_page_daily` (página) y `gsc_query_daily` (búsqueda × página × país × dispositivo), las tres por `search_type` (`web`, `image`). Search Analytics API sobre `sc-domain:enpalabras.com.ar` (`GSC_SITE_URL` para otra), con las mismas `GA_*`: la service account es usuaria restringida de la propiedad. **Los totales salen de `gsc_site_daily` o `gsc_page_daily`**: Google anonimiza las búsquedas poco frecuentes, y con la página junto a país o dispositivo esas filas se caen; `gsc_query_daily` suma ~la mitad de los clicks. Cada corrida re-pide los últimos 7 días (atraso de 2-3 días). Hay datos del 2025-05-26 al 2025-09-14 y desde el 2026-09-01; el hueco del medio no está en la API. **Sólo en v2**, como `combined_report_by_day`: el legacy no las tiene.
- **`tiktok/`** (rico, nuestro) → `analytics.tiktok_ads_daily` (anuncio × día: spend, impresiones, clicks, ctr/cpc/cpm, conversiones, reach, likes/comments/shares/profile_visits). Business API v1.3 `report/integrated/get` (fetch plano, sin SDK). Env: `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID`. **Tabla nuestra — sin grant.** Datos desde 2025-08 (inicio de la cuenta).

Las queries de los dashboards corren en la base de **v2** (sólo lectura): ventas en `public.orders`,
`order_items`, `order_payments`, … y marketing en `analytics`. Qué es una venta, qué significa cada tabla y
las trampas conocidas: `docs/conector/base.md`.

**Dashboards publicados**: `trafico-landing` (GA4 por landing, conversión por producto, inversión vs. pedidos
de TN) y `lanzamiento-journal-embarazo` (preventa del journal contra los lanzamientos de 2026). Los anteriores,
que leían del legacy, se dieron de baja el 2026-10-08 (están en el historial de git).

## Available API Endpoints

Base URL: the server origin (use `window.location.origin` in dashboards).

> El endpoint principal es **`/api/q/:slug/:query`** (named queries co-locadas, abajo). Además hay algunos utilitarios:

### `GET /api/me`

Returns the logged-in user: `{ "id": "...", "email": "user@enpalabras.com.ar", "name": "Full Name", "picture": "..." }`.

### `GET /api/meta/config`

Returns `{ "ad_account_id": "..." }` (el ID de cuenta de Meta del `.env`). Sirve para que los dashboards armen links al Administrador de anuncios: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=<id>&selected_ad_ids=<ad_id>`. Para ver el anuncio sin login conviene usar `preview_link` (de `analytics.meta_ad_entities`) en su lugar.

### `GET /api/health`

Health check (no auth required). Returns `{ "status": "ok", "timestamp": "..." }`.

### `GET /api/q/:slug/:query` — Named queries

El SQL de cada dashboard separa sus queries con **`-- @query <nombre>`** y el endpoint es
**`/api/q/<slug>/<nombre>`**, con los parámetros (`:from`, `:to`, …) por query string. Devuelve un array de
filas. Corre como `ep_readonly` en v2. Ejemplo y reglas en `docs/conector/dashboards.md`.

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

Referencias: `bun run dashboard pull trafico-landing` y `bun run dashboard pull lanzamiento-journal-embarazo`.

## Tech Stack

- Runtime: Bun
- Server: Express (TypeScript)
- Database: PostgreSQL (la de v2, proyecto `EP Core`)
- Charts: Chart.js 4 (CDN)
- Auth: Google OAuth (restringido a @enpalabras.com.ar)
- Styling: Custom base CSS (`/assets/dashboard-base.css`)

## Commands

```bash
bun run dev                 # Levantar server de desarrollo (hot reload)
bun run start               # Server de producción
bun run batch               # Traer datos de todas las fuentes (Meta, GA4, GA4-reports, IG, TikTok)
bun run dashboard           # pull / check / publish de un dashboard (ver arriba)
```

> Backfill de Meta por meses (la API rechaza rangos largos): `bun run scripts/backfill-meta.ts [from] [to]`.
