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

### `GET /api/health`

Health check (no auth required). Returns `{ "status": "ok", "timestamp": "..." }`.

### `GET /api/q/:name` — Named queries (custom SQL per dashboard)

Cuando un dashboard necesita una forma de los datos que las vistas existentes no cubren (por ejemplo, spend por campaña con rango de fechas), registralo como **query nombrada** en lugar de inflar las materialized views.

Cómo:

1. Crear `src/server/queries/<slug>.sql` con la SQL. Los parámetros se escriben con `:nombre` (no `$1`); el loader los traduce a placeholders posicionales al levantar el server.

   ```sql
   -- src/server/queries/spend-by-campaign-daily.sql
   SELECT date, campaign_name, SUM(spend) AS spend
   FROM meta_insights
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
