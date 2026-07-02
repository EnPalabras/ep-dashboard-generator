-- Eventos GA4 (key events / conversiones) agregados por nombre para un rango.
SELECT
  event_name,
  SUM(event_count) AS event_count,
  SUM(conversions) AS conversions
FROM ga4_events_daily
WHERE date BETWEEN :from AND :to
GROUP BY event_name
ORDER BY event_count DESC;
