# Roadmap — Importar fuentes de datos (salir de Windsor.ai)

Objetivo: traer a nuestra propia base los datos que hoy salen de Windsor.ai, fuente por fuente,
y dejar de depender de ese conector. El patrón es siempre el mismo: un **batch** (en `src/batch/`)
que pega a la API oficial y hace upsert en Postgres, una **GitHub Action** que lo corre solo
(ya existe: `.github/workflows/fetch-data.yml`, cada 12 h), y **queries nombradas**
(`src/server/queries/*.sql`) que exponen los datos a los dashboards.

## Estado

| Fuente | Estado | Llaves | Prioridad |
|--------|--------|--------|-----------|
| **Meta Ads** | ✅ Implementado | Ya las tenemos (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`) | — |
| Instagram orgánico | ⏳ Pendiente | Reusa el token de Meta (faltan permisos IG) | Alta (mismo token) |
| GA4 | ✅ Implementado | Service account (`GA_*` en env) | — |
| TikTok orgánico | ⏳ Pendiente | Falta app + OAuth de TikTok | Baja (API más limitada) |

---

## 1. Meta Ads — ✅ Hecho

Cubre `fetchMetaTotal`, `fetchMetaDaily`, `fetchMetaAds`, `fetchCampaigns`.
- Tablas: `meta_campaign_insights` (ad×día, ahora con `frequency`, `purchase_roas`, `omni_purchase`, `omni_purchase_value`), `meta_account_daily`, `meta_account_totals`, `meta_ad_entities`.
- Endpoints: `/api/q/meta-total`, `/api/q/meta-daily`, `/api/q/meta-ads`, `/api/q/meta-campaigns`.
- Clave de diseño: reach/frequency a nivel cuenta vienen de llamadas `level=account` (no se suman desde el detalle por anuncio).

---

## 2. Instagram orgánico — siguiente (mismo token de Meta)

Es la migración más barata: la **Instagram Graph API** usa el mismo Graph de Facebook y, casi seguro,
el mismo token que ya usamos para Ads (la cuenta IG `17841442623692041` está ligada a una página de FB).

**Prerrequisitos:** agregar permisos al token: `instagram_basic`, `instagram_manage_insights`,
`pages_read_engagement`. Confirmar el `IG_USER_ID` (la cuenta business).

**Qué pide Belén:**
- Nivel cuenta/día: `likes`, `comments`, `saves`, `shares`.
- Nivel post: `date`, `media_type` (REELS/CAROUSEL_ALBUM/IMAGE), `media_views`, `media_reach`, `media_engagement`, `media_shares`.
- Calculados: `ER% = engagement / reach × 100`, `WoW%`.
- ⚠️ La API **no** devuelve caption ni permalink fácilmente por insights (sí por el endpoint `/media` con campo `permalink` — vale la pena pedirlo de paso).

**API:** `GET /{ig-user-id}/media?fields=id,media_type,timestamp,permalink,insights.metric(reach,views,total_interactions,saved,shares,comments,likes)`.
Para totales de cuenta: `GET /{ig-user-id}/insights?metric=...&period=day`.

**Tablas propuestas:**
- `ig_account_daily(date PK, likes, comments, saves, shares, ...)`
- `ig_posts(media_id PK, date, media_type, permalink, views, reach, engagement, shares)` — ER% se calcula en la query.

**Esfuerzo:** ~medio día. Es el mejor candidato para hacer apenas se confirmen los permisos del token.

---

## 3. Google Analytics 4 — ✅ Hecho

Implementado con alcance **completo** (adquisición + conversiones), no solo orgánico:
- Módulo `src/batch/ga4/` (client + fetch + schema). Auth por service account, token firmado con `crypto` nativo (sin deps nuevas).
- Tablas: `ga4_traffic_daily` (date × channel × source × medium) y `ga4_events_daily` (date × event_name).
- Endpoints: `/api/q/ga4-traffic`, `/api/q/ga4-traffic-daily`, `/api/q/ga4-events`.
- Backfill cargado desde 2025-01-01 (mismo rango que Meta). Detalle en `CLAUDE.md` → sección GA4.

### Diseño original (referencia) — sesiones orgánicas

**API:** Google Analytics **Data API (GA4)** `v1beta`, método `runReport`. Property `313672428`.

**Prerrequisitos (lo que falta):** una credencial de Google con acceso de lectura a la property.
Recomendado: **service account** (JSON en secret `GA4_SA_KEY`) con rol Viewer en GA4 —
es lo más simple para un batch headless (no depende del login OAuth que ya usamos para entrar al dashboard).

**Qué pide Belén:** `sessions` por `date`, `source`, `medium` (filtrando `medium = organic`). WoW se calcula nosotros.

**Request:** dimensions `date, sessionSource, sessionMedium`; metric `sessions`; dateRange; filtro `sessionMedium = organic`.

**Tabla propuesta:** `ga4_sessions_daily(date, source, medium, sessions, PRIMARY KEY(date, source, medium))`.

**Esfuerzo:** ~medio día una vez que tengamos el JSON del service account.

---

## 4. TikTok orgánico — última (API más limitada)

**API:** TikTok for Developers — **Display API / Business API** según acceso. Cuenta orgánica.

**Prerrequisitos (lo más pesado):** crear una app en TikTok for Developers, OAuth con la cuenta,
y guardar el refresh token. El acceso a analytics orgánico requiere aprobar scopes (puede demorar).

**Qué pide Belén (nivel cuenta-día):** `date`, `video_views`, `likes`, `comments`, `shares`, `followers_count` (neto), `video_id` del día.
- ⚠️ Limitaciones conocidas de la API: **no** hay métricas por video individual, ni título/descripción, ni reach único por video. `comments` puede venir negativo (comentarios borrados).
- Campos que hoy salían del summary de Windsor y habría que confirmar cómo se llaman en la API: `unique_views`, `engaged_users`, `profile_views`, `total_followers`.

**Tabla propuesta:** `tiktok_account_daily(date PK, video_views, likes, comments, shares, followers_count, video_id)`.

**Esfuerzo:** ~1–2 días, mayormente por el alta de la app y la aprobación de scopes. Por eso queda última.

---

## Notas comunes

- **Patrón:** un módulo nuevo por fuente en `src/batch/<fuente>/` (client + fetch + schema), llamado desde `src/batch/run.ts` con su propio try/catch para que una fuente caída no tumbe a las demás.
- **Secrets:** cada fuente nueva agrega secrets a la GitHub Action (`.github/workflows/fetch-data.yml`) y al `.env` local.
- **Lectura:** preferir queries nombradas (`/api/q/<slug>`) salvo que haga falta pre-agregar mucho (ahí, materialized view en `src/server/db/views.ts`).
- **Esquema:** todo en SQL idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) para que `bun run db:init` se pueda re-correr sin romper nada.
