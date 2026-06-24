# Plan — Ampliar los datos de Meta Ads en el dashboard generator

## Contexto

El PM (Ezequiel) mandó el set de campos que usa el `automate_meta_report` + el field list del API Explorer de Meta. El objetivo es **traer la mayor cantidad de datos posible** para hacer reportes para gente no técnica (las founders, Belu/Jochi).

Hallazgos del relevamiento:
- Lo que tenemos hoy (a nivel anuncio): `spend, impressions, clicks, conversions, reach, cpm, cpp, ctr, cpc, objective, frequency, actions, action_values, purchase_roas`. De `actions` solo extraemos **compras** (`omni_purchase`) y su valor.
- Los campos con `+` del diff de Ezequiel (`campaign_id, adset_id, cpm, cpp, cpc, objective`) ya los tenemos — el `automate_meta_report` no. No perdemos nada.
- **ROAS y CAC ya son calculables** con lo que hay (`omni_purchase_value/spend` y `spend/omni_purchase`); solo falta exponer CAC.
- Los dashboards actuales son **de prueba y descartables** → libertad para reestructurar la DB de cero (`db:init`) y hacer backfill.

Decisión tomada con el usuario: **incluir también el grano por plataforma** (IG/FB, feed/stories/reels) en esta tanda.

## Archivos clave a tocar

- `src/batch/meta/client.ts` — fields del fetch + nuevo fetch con breakdowns + helpers de extracción
- `src/batch/meta/fetch.ts` — upserts (columnas nuevas + nueva tabla por plataforma)
- `src/batch/meta/schema.sql` — columnas e índices nuevos + tabla `meta_platform_insights`
- `src/server/queries/*.sql` — exponer lo nuevo (CAC, engagement, breakdown)
- `src/server/db/views.ts` — sólo si queremos las nuevas métricas en las MVs
- `CLAUDE.md` — actualizar el doc de schema y queries
- `scripts/init-db.ts` — re-init de cero (wipe + recreate)

## Diseño

### Grano 1 — `meta_campaign_insights` (anuncio × día) — REESTRUCTURAR
Fuente de verdad de totales correctos (reach deduplicado). Se mantiene el grano, se suman columnas y se borra `status` (no se usa).

**Nuevos campos a pedir en `fetchCampaignInsights` (Tier A — alta confianza):**
- Rankings (sólo nivel anuncio, TEXT): `quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking`
- `attribution_setting` (TEXT), `buying_type` (TEXT)
- `cost_per_action_type` → extraer CPA de compra (y de los tipos que importen)
- `website_purchase_roas` → extraer valor
- `unique_actions` → extraer por tipo relevante

**Action types a extraer del array `actions` (cada uno su columna INTEGER):**
- `purchase` (compra web pura) — **además** de `omni_purchase`, para no mezclar
- `onsite_conversion.post_save` (guardados)
- `comment` (comentarios)
- `link_click` (clics al link)
- `post` (compartidos/reposteos)
- `post_reaction` (reacciones)
- `onsite_conversion.messaging_first_reply` (contactos nuevos por mensaje)
- `onsite_conversion.messaging_conversation_started_7d` (conversaciones iniciadas)

**Extra recomendado FUERA de la lista del PM (requiere OK explícito):**
- `add_to_cart` (agregados al carrito) — necesario para el ratio "ATC→Compra" que el reporte Meta actual usa en todas las tablas. No lo pidió Ezequiel; lo marco como extra. Sin esto no se reproduce ese reporte.

> **Tier B — validar shape antes de comprometer columna** (`results`, `result_rate`, `objective_results`, `objective_result_rate`, `conversion_values`, `website_ctr`, `shop_clicks`). Son campos array/anidados o que pueden no venir para esta cuenta. Paso previo: un fetch de prueba (o el API Explorer con el token del PM) para ver el JSON real; recién ahí se decide columna o se descarta. No se agregan "a gusto".

> **Bump de versión API:** hoy `META_API_VERSION = "v21.0"`; el Explorer del PM usa v25.0. Varios campos nuevos (p.ej. `result_rate`) pueden requerir versión más nueva. Subir a una versión reciente y verificar que los campos respondan.

### Grano 2 — `meta_platform_insights` (anuncio × plataforma × posición × día) — TABLA NUEVA
Para el split "IG vs FB / feed vs stories vs reels". Va aparte porque **el reach no se suma entre plataformas** (dedup de Meta), igual que ya pasa a nivel cuenta.
- Nuevo fetch `fetchPlatformInsights` con `breakdowns=publisher_platform,platform_position`, `level=ad`, `time_increment=1`.
- Columnas: claves (`campaign_id, adset_id, ad_id, date, publisher_platform, platform_position`) + `spend, impressions, clicks, reach, frequency, ctr, cpm, cpc, omni_purchase, omni_purchase_value`.
- Unique key incluye las dimensiones de breakdown.

### Nivel cuenta (`meta_account_daily` / `meta_account_totals`)
Sumar también los action types de engagement/mensajería al fetch de cuenta, para tener totales de cuenta de esas métricas.

### Helpers (en `client.ts`)
Reusar `pickAction(arr, type)`. Sumar: extracción desde `cost_per_action_type`/`unique_actions`/`website_purchase_roas` (mismo patrón `{action_type, value}`), y passthrough de los rankings (strings).

## Exponer en queries (`/api/q/...`)
- Extender `meta-ads.sql`: sumar rankings, CAC (`spend/omni_purchase`), CPA, engagement por anuncio.
- Nueva query `meta-engagement.sql` (o ampliar `meta-daily.sql`): guardados/comentarios/compartidos/reacciones/mensajes por día.
- Nueva query `meta-por-plataforma.sql` contra `meta_platform_insights` (spend/compras/roas por IG vs FB, rango de fechas).
- Actualizar el doc de schema/queries en `CLAUDE.md`.

## Backfill — desde 2025-01-01
Objetivo: traer **todo lo que Meta deje extraer desde 2025-01-01** (hoy 2026-06-24 → ≈540 días).
1. Correr `SELECT MIN(date), MAX(date) FROM meta_campaign_insights` para ver qué hay hoy.
2. El lookback hoy es `process.argv[2]` desde "hoy" (`src/batch/run.ts:9`). Dos opciones:
   - Rápida: `bun run batch 540` (cubre desde ~2025-01-01).
   - Más limpia: extender `run.ts` para aceptar `--from=2025-01-01` (rango explícito en vez de "días atrás"), así no depende de la fecha en que se corre. **Recomendada.**
   El upsert refresca **todas** las columnas → rellena lo nuevo en fechas viejas.
3. Se backfillea: `frequency, purchase_roas, omni_purchase, omni_purchase_value` y todos los campos nuevos en `meta_campaign_insights`, `meta_platform_insights` y `meta_account_daily`.
4. **No** se backfillea: `meta_account_totals` (ventanas móviles, se recalculan), `meta_ad_entities` (foto actual). Los **rankings** en fechas viejas probablemente vengan vacíos (limitación de Meta) — backfilleamos igual lo que venga.
5. Ventana de ~540 días = muchas páginas/rate limit. El client ya tiene retry+backoff, pero correr por **tramos mensuales** para no chocar límites y poder reintentar tramos puntuales.

## Mensaje para Belu / Jochi (entregable aparte)

> **Datos de Meta Ads a los que van a tener acceso**
> Todo filtrable por fecha y abrible por día / campaña / anuncio:
> 💰 **Inversión y costos** — gasto · CPM · CPC · CPP · CAC (costo de conseguir un cliente)
> 👀 **Alcance** — impresiones · alcance (personas únicas) · frecuencia
> 🛒 **Ventas** — compras (cantidad y $) · ROAS · resultados según el objetivo de la campaña
> ❤️ **Interacción** — reacciones · comentarios · compartidos · guardados · clics al link · mensajes (contactos nuevos y conversaciones iniciadas)
> 📊 **Calidad del anuncio** — los 3 rankings de Meta (calidad, interacción, conversión)
> 📱 **Por plataforma** — separar todo entre Instagram y Facebook, y por ubicación (feed, stories, reels)

## Gap analysis — reporte Meta Ads actual (`reporte_meta_20260621`)
Qué del reporte NO se arma con el modelo actual + lo planificado:
1. **ATC y ratio "ATC→Compra"** — falta el action type `add_to_cart` (extra fuera de la lista del PM, ver arriba). Es el gap más usado en el reporte.
2. **Frecuencia/reach por campaña o anuncio en una ventana (semana/mes)** — el reach no se deduplica sumando días; hoy solo es exacto a nivel cuenta. Para campaña/anuncio haría falta un fetch extra con la ventana completa (sin `time_increment` diario). `meta-ads.sql` hoy hace `AVG(frequency)` ≈ aproximación.
3. **Targets/umbrales del negocio** (ROAS 6x, CAC ≤$10k, CPM ref $2.655, frecuencia 2,5, CTR baseline) — no salen de Meta; cargar a mano como config para las alertas.
4. **Estado a nivel campaña/adset** — hoy solo `effective_status` a nivel anuncio. Derivable o fetch de entidades extra. Menor.
5. **Análisis competitivo (sección 6)** — viene de la **Meta Ad Library API**, fuente distinta, fuera del pipeline. Proyecto aparte si lo quieren.

> Sí cubierto: gasto, impresiones, CTR, CPM, compras, ROAS, ingresos $, por día/campaña/anuncio/adset, semana-vs-mes, ROAS=0, top/bottom. Las secciones de diagnóstico/ideas/plan son texto IA, no datos.

## Verificación
1. `bun run db:init` recrea schema sin errores; las tablas tienen las columnas nuevas.
2. `bun run batch 7` (ventana corta) corre sin error y carga filas en `meta_campaign_insights` y `meta_platform_insights`.
3. Chequear con SQL que las columnas nuevas traen datos (no todo 0) en fechas recientes.
4. `curl /api/q/meta-ads?from=...&to=...` y `/api/q/meta-por-plataforma?...` devuelven los campos nuevos.
5. Backfill con ventana grande y re-chequear cobertura histórica.
6. Levantar un dashboard de prueba que pinte un par de las métricas nuevas para confirmar el end-to-end.
