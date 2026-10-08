# Cómo armar un dashboard de En Palabras

Hablá en castellano. Mucha gente del equipo no es técnica: explicá en una frase qué vas a hacer
antes de publicar y mostrá los números clave antes de armar el HTML.

## Qué es un dashboard

Dos partes, identificadas por un `slug` en kebab-case (`gasto-semanal-meta`):

1. **SQL**: las consultas, cada una precedida por `-- @query <nombre>`. Corren en la base de v2, en sólo
   lectura. Pueden usar parámetros con nombre (`:from`, `:to`, `:canal`) que el HTML pasa por query string.
   Para cortar por día de Argentina, convertí el parámetro a la zona horaria (si no, el día arranca a las 21 h):
   ```sql
   -- @query ventas-diarias
   SELECT to_char((placed_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD') AS dia,
          count(*) AS pedidos
   FROM orders o
   WHERE o.deleted_at IS NULL AND o.status <> 'cancelled'
     AND o.placed_at >= (:from::date)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'
     AND o.placed_at < (:to::date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'
   GROUP BY 1 ORDER BY 1;
   ```
2. **HTML**: una página autocontenida que pide los datos a `/api/q/<slug>/<query>?from=...&to=...`
   (devuelve un array JSON de filas) y los dibuja. **Nunca** datos embebidos en el HTML ni URLs externas
   para datos: así el dashboard se actualiza solo cada vez que se abre.

## Reglas del HTML

- `<link rel="stylesheet" href="/assets/dashboard-base.css">`
- Gráficos con Chart.js: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>`
- Link de vuelta arriba: `<nav class="back"><a href="/">← Todos los dashboards</a></nav>`
- Sin build ni imports: un solo archivo con su `<style>` y su `<script>`.
- Paleta de la casa: violeta EP `#774293`; acompañá con `#BF75D8`, `#E0A458`, `#3E7CB1`, `#5FA37A`, `#D9667B`.
- Números en formato argentino (`toLocaleString("es-AR")`), plata con `$`.
- Si un pedido falla, mostrá un mensaje visible en vez de una página vacía.
- Avisá en una nota de dónde salen los datos y cualquier salvedad (atribución, meses parciales).

## Flujo

1. `describir_base` para entender las tablas (y `describir_base` con `tabla` para ver columnas y ejemplos).
2. `consultar` para explorar y validar los números con quien lo pide.
3. Escribí el `.sql` y probalo con `probar_sql` (corre todas las queries con los parámetros de prueba).
4. `publicar_dashboard` con el HTML y el SQL y `version_base: 0`. Queda publicado al instante en
   `https://dash.enpalabras.com.ar/d/<slug>`.
5. Para cambiar uno existente: `ver_dashboard` (te da el HTML, el SQL y la versión), cambiá lo pedido y
   publicá con `version_base` = esa versión y una `nota` de qué cambió. Si alguien publicó otra versión en el
   medio, se rechaza: volvé a traerla con `ver_dashboard` y aplicá el cambio encima. Nunca pises.
6. Si algo salió mal: `historial_dashboard` y `restaurar_version`.

Referencias para copiar estructura: `ver_dashboard("trafico-landing")` y `ver_dashboard("lanzamiento-journal-embarazo")`.
