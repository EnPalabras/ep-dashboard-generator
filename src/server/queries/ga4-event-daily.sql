-- Serie diaria de un evento GA4 puntual (ej. compra_producto) para un rango.
-- Uso: /api/q/ga4-event-daily?event=compra_producto&from=2026-06-01&to=2026-06-30
SELECT
  date,
  SUM(event_count) AS event_count,
  SUM(conversions) AS conversions
FROM ga4_events_daily
WHERE event_name = :event
  AND date BETWEEN :from AND :to
GROUP BY date
ORDER BY date;
